/**
 * 排版问题检测规则。
 *
 * 五类问题：
 *  - overflow       文字越过控件内容区/控件框
 *  - truncation     出现省略号截断（wrap 模式超 maxLines 同属此类）
 *  - overlap        两个可见控件的文本/图标互相压盖
 *  - missing-glyph  整条字体回退链都没有的码点
 *  - shrink         shrink 模式实际字号比设计字号小（可能不符合视觉规范）
 *
 * 每个 Issue 都带文本表行号（TextEntry.row），修复时可直接定位。
 */
import type {
  Issue,
  LayoutDocument,
  Rect,
  ScreenResult,
  TextLayoutResult,
  Widget,
} from '../types';

export interface DetectInput {
  layout: LayoutDocument;
  lang: ScreenResult['lang'];
  textLayouts: TextLayoutResult[];
  widgetCount: number;
  durationMs: number;
}

const EPS = 0.75;

export function detectIssues(input: DetectInput): ScreenResult {
  const { layout, lang, textLayouts } = input;
  const issues: Issue[] = [];
  const widgetsById = new Map<string, Widget>();
  walkWidgets(layout.widgets, (w) => widgetsById.set(w.id, w));

  for (const tl of textLayouts) {
    const widget = widgetsById.get(tl.widgetId);
    if (!widget) continue;

    // 1. 缺字
    if (tl.missingGlyphs.length) {
      issues.push({
        type: 'missing-glyph',
        severity: 'error',
        layoutId: layout.id,
        lang,
        widgetId: widget.id,
        textKey: tl.textKey,
        sourceRow: tl.sourceRow,
        source: layout.source,
        message:
          `字体回退链缺少 ${tl.missingGlyphs.length} 个字符：` +
          tl.missingGlyphs
            .slice(0, 6)
            .map((m) => `${m.char}(U+${m.codePoint.toString(16).toUpperCase().padStart(4, '0')})`)
            .join('、') +
          (tl.missingGlyphs.length > 6 ? ' …' : ''),
        rect: widget.rect,
        missing: tl.missingGlyphs,
      });
    }

    // 2. 截断
    if (tl.truncated) {
      issues.push({
        type: 'truncation',
        severity: 'error',
        layoutId: layout.id,
        lang,
        widgetId: widget.id,
        textKey: tl.textKey,
        sourceRow: tl.sourceRow,
        source: layout.source,
        message: `文本被截断（${widget.overflow === 'truncate' ? '单行省略' : `超过最大行数 ${widget.maxLines}`}）`,
        rect: widget.rect,
        metrics: {
          contentWidth: tl.contentRect.w,
          contentHeight: tl.contentRect.h,
          actualWidth: Math.round(tl.bounds.w),
          actualHeight: Math.round(tl.bounds.h),
        },
      });
    }

    // 3. 超框
    if (tl.overflowed && !tl.truncated) {
      const over = overflowAmount(tl.bounds, tl.contentRect);
      issues.push({
        type: 'overflow',
        severity: 'error',
        layoutId: layout.id,
        lang,
        widgetId: widget.id,
        textKey: tl.textKey,
        sourceRow: tl.sourceRow,
        source: layout.source,
        message:
          `文字超出控件框：右溢 ${over.right.toFixed(1)}px、下溢 ${over.bottom.toFixed(1)}px` +
          (over.left > 0 ? `、左溢 ${over.left.toFixed(1)}px` : '') +
          (over.top > 0 ? `、上溢 ${over.top.toFixed(1)}px` : ''),
        rect: unionRect(tl.bounds, widget.rect),
        metrics: {
          overflowRight: over.right,
          overflowBottom: over.bottom,
          contentWidth: tl.contentRect.w,
          actualWidth: Math.round(tl.bounds.w),
        },
      });
    }

    // 4. shrink 触发
    if (widget.overflow === 'shrink' && tl.effectiveFontSize < widget.fontSize) {
      issues.push({
        type: 'shrink',
        severity: 'warning',
        layoutId: layout.id,
        lang,
        widgetId: widget.id,
        textKey: tl.textKey,
        sourceRow: tl.sourceRow,
        source: layout.source,
        message: `字号从 ${widget.fontSize}px 自动缩小到 ${tl.effectiveFontSize}px 才容纳下文本`,
        rect: widget.rect,
        metrics: { designFontSize: widget.fontSize, effectiveFontSize: tl.effectiveFontSize },
      });
    }
  }

  // 5. 控件间重叠（只检测带文本的可见控件，以及与按钮/图片的压盖）
  const textWidgets = textLayouts
    .map((tl) => ({ tl, widget: widgetsById.get(tl.widgetId)! }))
    .filter((x) => x.widget && isVisible(x.widget));
  for (let i = 0; i < textWidgets.length; i++) {
    for (let j = i + 1; j < textWidgets.length; j++) {
      const a = textWidgets[i];
      const b = textWidgets[j];
      if (!isVisible(b.widget)) continue;
      if (isAncestor(a.widget, b.widget) || isAncestor(b.widget, a.widget)) continue;
      const overlap = rectIntersect(a.tl.bounds, b.tl.bounds);
      if (overlap) {
        const area = overlap.w * overlap.h;
        const minArea = Math.min(a.tl.bounds.w * a.tl.bounds.h, b.tl.bounds.w * b.tl.bounds.h);
        if (minArea <= 0) continue;
        // 压盖超过任一方文本面积 15% 才报，避免擦边误报
        if (area / minArea < 0.15) continue;
        issues.push({
          type: 'overlap',
          severity: 'error',
          layoutId: layout.id,
          lang,
          widgetId: a.widget.id,
          relatedWidgetId: b.widget.id,
          textKey: a.tl.textKey,
          sourceRow: a.tl.sourceRow,
          source: layout.source,
          message: `控件 ${a.widget.id} 的文本与 ${b.widget.id} 压盖（重叠 ${overlap.w.toFixed(0)}×${overlap.h.toFixed(0)}px）`,
          rect: overlap,
          metrics: { overlapArea: area, ratio: area / minArea },
        });
      }
    }
  }

  return {
    layoutId: layout.id,
    layoutName: layout.name,
    lang,
    issues,
    textLayouts,
    durationMs: input.durationMs,
    widgetCount: input.widgetCount,
  };
}

function walkWidgets(widgets: Widget[], fn: (w: Widget) => void): void {
  for (const w of widgets) {
    fn(w);
    if (w.children) walkWidgets(w.children, fn);
  }
}

function isVisible(w: Widget): boolean {
  return w.rect.w > 1 && w.rect.h > 1;
}

function isAncestor(maybeAncestor: Widget, w: Widget): boolean {
  // 布局模型中容器与子控件的重叠属于预期；这里用 id 前缀模拟层级关系
  if (!maybeAncestor.children?.length) return false;
  let found = false;
  walkWidgets(maybeAncestor.children, (c) => {
    if (c.id === w.id) found = true;
  });
  return found;
}

function rectIntersect(a: Rect, b: Rect): Rect | null {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w);
  const y2 = Math.min(a.y + a.h, b.y + b.h);
  if (x2 - x1 <= EPS || y2 - y1 <= EPS) return null;
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

function overflowAmount(bounds: Rect, content: Rect) {
  return {
    left: Math.max(0, content.x - bounds.x),
    right: Math.max(0, bounds.x + bounds.w - (content.x + content.w)),
    top: Math.max(0, content.y - bounds.y),
    bottom: Math.max(0, bounds.y + bounds.h - (content.y + content.h)),
  };
}

function unionRect(a: Rect, b: Rect): Rect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return {
    x,
    y,
    w: Math.max(a.x + a.w, b.x + b.w) - x,
    h: Math.max(a.y + a.h, b.y + b.h) - y,
  };
}

export function summarize(results: ScreenResult[]): {
  totalIssues: number;
  byType: Record<Issue['type'], number>;
  byLang: Partial<Record<Issue['lang'], number>>;
} {
  const byType = { overflow: 0, truncation: 0, overlap: 0, 'missing-glyph': 0, shrink: 0 } as Record<Issue['type'], number>;
  const byLang: Partial<Record<Issue['lang'], number>> = {};
  let totalIssues = 0;
  for (const r of results) {
    for (const iss of r.issues) {
      byType[iss.type] += 1;
      byLang[iss.lang] = (byLang[iss.lang] ?? 0) + 1;
      totalIssues += 1;
    }
  }
  return { totalIssues, byType, byLang };
}
