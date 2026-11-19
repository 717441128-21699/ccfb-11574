/**
 * 单界面 × 单语言的完整编排：
 * 布局 RTL 镜像 → 文本查表 → 变量最坏值替换 → 富文本解析 → 排版 → 检测
 */
import type {
  LayoutDocument,
  ScreenResult,
  TextLayoutResult,
  TextTable,
  Widget,
  WorstCaseVars,
} from '../types';
import { parseRichText } from '../text/richtext';
import { substituteVariables } from '../text/variables';
import { layoutText } from '../text/layoutEngine';
import { FontRegistry, GraphicsLike } from '../text/fontResolver';
import { detectIssues } from './detector';

export interface RunOptions {
  registry: FontRegistry;
  g: GraphicsLike;
  worstCase?: WorstCaseVars;
}

export function runScreen(
  layout: LayoutDocument,
  table: TextTable,
  opts: RunOptions,
): ScreenResult {
  const start = performance.now();
  const widgets = flattenWidgets(layout.widgets);
  const rtl = layout.rtl === true || table.lang === 'ar';

  const textLayouts: TextLayoutResult[] = [];
  for (const widget of widgets) {
    if (widget.type !== 'text' && widget.type !== 'button') continue;
    const entry = widget.textKey ? table.index.get(widget.textKey) : undefined;
    const rawTemplate = entry !== undefined ? table.entries[entry].text : widget.inlineText ?? '';
    const row = entry !== undefined ? table.entries[entry].row : 0;
    if (!rawTemplate) continue;

    // RTL 界面下镜像控件位置
    const effectiveWidget = rtl && widget.rtlMirror ? mirrorWidget(widget, layout.designWidth) : widget;

    const substituted = substituteVariables(rawTemplate, table.lang, opts.worstCase);
    const parsed = parseRichText(substituted, effectiveWidget.color);
    const tl = layoutText(
      { registry: opts.registry, g: opts.g, lang: table.lang },
      effectiveWidget,
      parsed.runs,
      row,
      substituted,
    );
    textLayouts.push(tl);
  }

  const result = detectIssues({
    layout,
    lang: table.lang,
    textLayouts,
    widgetCount: widgets.length,
    durationMs: 0,
  });
  result.durationMs = performance.now() - start;
  return result;
}

function flattenWidgets(widgets: Widget[]): Widget[] {
  const out: Widget[] = [];
  const walk = (list: Widget[]) => {
    for (const w of list) {
      out.push(w);
      if (w.children?.length) walk(w.children);
    }
  };
  walk(widgets);
  return out;
}

function mirrorWidget(w: Widget, designWidth: number): Widget {
  return {
    ...w,
    rect: { ...w.rect, x: designWidth - w.rect.x - w.rect.w },
    padding: { ...w.padding },
  };
}

/** 创建离屏测量上下文（主线程/Worker 均可用） */
export function createMeasureContext(): GraphicsLike {
  const canvas = new OffscreenCanvas(32, 32);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('无法创建 2D 上下文');
  return ctx;
}
