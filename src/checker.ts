import type {
  Issue, LayoutResult, ScreenDef, ScreenReport, TextTable, WidgetDef, WidgetLayout,
} from './types';
import type { FontManager } from './fonts';
import type { Measurer } from './measure';
import { layoutRuns } from './layout';
import { parseRichText, substituteVars } from './richtext';

export interface CheckEnv {
  fonts: FontManager;
  measurer: Measurer;
  table: TextTable;
  vars: Record<string, string>;
  leading: number;
  iconRatio: number;
}

const EPS = 0.5;

function checkWidget(
  screen: ScreenDef, w: WidgetDef, lang: string, env: CheckEnv,
  issues: Issue[],
): WidgetLayout {
  const base: WidgetLayout = { widget: w, result: null, textRect: null, missingGlyphs: [] };
  if (!w.textKey || w.type === 'panel' || w.type === 'image') return base;

  const entry = env.table.entries.get(w.textKey);
  if (!entry) {
    issues.push({
      screenId: screen.id, screenName: screen.name, lang, widgetId: w.id,
      type: 'missing-key', textKey: w.textKey, row: -1,
      message: `文本表缺少 key「${w.textKey}」`,
    });
    return base;
  }
  const raw = entry.texts[lang];
  if (raw === undefined) {
    issues.push({
      screenId: screen.id, screenName: screen.name, lang, widgetId: w.id,
      type: 'missing-key', textKey: w.textKey, row: entry.row,
      message: `第 ${entry.row} 行缺少「${lang}」译文`,
    });
    return base;
  }

  const cfg = env.fonts.configFor(lang);
  const text = substituteVars(raw, env.vars);
  const runs = parseRichText(text, w.rich ?? false);
  const size = w.fontSize ?? 16;
  const pad = w.padding ?? 0;
  const availW = Math.max(w.w - pad * 2, 1);
  const availH = Math.max(w.h - pad * 2, 1);

  const result: LayoutResult = layoutRuns(runs, {
    lang, rtl: cfg.rtl,
    availW, availH,
    baseSize: size,
    stackCSS: env.fonts.stackCSS(lang, w.fontFamily),
    wrap: w.wrap ?? true,
    maxLines: w.maxLines ?? 0,
    ellipsis: w.ellipsis ?? false,
    leading: env.leading,
    iconRatio: env.iconRatio,
  }, env.measurer);
  base.result = result;

  const missing = env.fonts.missingGlyphs(lang, text);
  base.missingGlyphs = missing;
  if (missing.length) {
    issues.push({
      screenId: screen.id, screenName: screen.name, lang, widgetId: w.id,
      type: 'missing-glyph', textKey: w.textKey, row: entry.row,
      message: `字体栈缺字形:${missing.slice(0, 8).join(' ')}${missing.length > 8 ? '…' : ''}`,
    });
  }

  const box = { w: availW, h: availH };
  if (result.contentW > availW + EPS) {
    issues.push({
      screenId: screen.id, screenName: screen.name, lang, widgetId: w.id,
      type: 'overflow-x', textKey: w.textKey, row: entry.row,
      message: `文本宽 ${result.contentW.toFixed(1)}px > 可用 ${availW}px`,
      measured: { w: result.contentW, h: result.contentH }, box,
    });
  }
  if (result.truncated || result.contentH > availH + EPS) {
    issues.push({
      screenId: screen.id, screenName: screen.name, lang, widgetId: w.id,
      type: 'overflow-y', textKey: w.textKey, row: entry.row,
      message: result.truncated
        ? `行数/高度超限被截断(内容高 ${result.contentH.toFixed(1)}px,可用 ${availH}px)`
        : `内容高 ${result.contentH.toFixed(1)}px > 可用 ${availH}px`,
      measured: { w: result.contentW, h: result.contentH }, box,
    });
  }

  // 文本实际渲染矩形(屏幕坐标),供交叠检测与渲染高亮
  const align = w.align ?? (cfg.rtl ? 'right' : 'left');
  const valign = w.valign ?? 'middle';
  const lineH0 = result.lines.length ? result.contentH / result.lines.length : 0;
  let tx = w.x + pad;
  if (align === 'center') tx = w.x + pad + (availW - result.contentW) / 2;
  else if (align === 'right') tx = w.x + pad + (availW - result.contentW);
  let ty = w.y + pad;
  if (valign === 'middle') ty = w.y + pad + (availH - result.contentH) / 2;
  else if (valign === 'bottom') ty = w.y + pad + (availH - result.contentH);
  if (result.lines.length) {
    base.textRect = {
      x: tx, y: ty,
      w: result.contentW,
      h: Math.max(result.contentH, lineH0),
    };
  }
  return base;
}

interface Rect { x: number; y: number; w: number; h: number }
const intersect = (a: Rect, b: Rect) =>
  a.x < b.x + b.w - EPS && b.x < a.x + a.w - EPS && a.y < b.y + b.h - EPS && b.y < a.y + a.h - EPS;
const contains = (a: Rect, b: Rect) =>
  a.x <= b.x + EPS && a.y <= b.y + EPS && a.x + a.w >= b.x + b.w - EPS && a.y + a.h >= b.y + b.h - EPS;

/** 单界面单语言:逐控件排版 + 交叠检测 */
export function checkScreen(screen: ScreenDef, lang: string, env: CheckEnv): ScreenReport {
  const issues: Issue[] = [];
  const layouts = screen.widgets.map((w) => checkWidget(screen, w, lang, env, issues));

  // 交叠:文本实际渲染矩形 vs 其他控件的声明框(背景除外;互相包含视为父子,跳过)
  for (const l of layouts) {
    if (!l.textRect) continue;
    for (const other of screen.widgets) {
      if (other.id === l.widget.id || other.background) continue;
      const r: Rect = { x: other.x, y: other.y, w: other.w, h: other.h };
      if (!intersect(l.textRect, r)) continue;
      if (contains(r, l.textRect) || contains(l.textRect, r)) continue;
      const entry = l.widget.textKey ? env.table.entries.get(l.widget.textKey) : undefined;
      issues.push({
        screenId: screen.id, screenName: screen.name, lang, widgetId: l.widget.id,
        type: 'overlap', textKey: l.widget.textKey, row: entry?.row ?? -1,
        message: `文本实际范围压住控件「${other.id}」`,
        measured: { w: l.textRect.w, h: l.textRect.h },
        box: { w: l.widget.w, h: l.widget.h },
      });
    }
  }
  return { screen, lang, layouts, issues };
}
