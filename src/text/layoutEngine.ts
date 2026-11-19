/**
 * Canvas 文本排版引擎。
 *
 * 与游戏引擎对齐的排版规则：
 *  - 显式换行 \\n 分段；每段按字素簇做贪心换行，断行点为空格之后，
 *    泰文/天城文在辅音簇边界断（无空格文字）；
 *  - 富文本每个 run 独立字体样式，但换行在 run 边界与簇边界统一处理；
 *  - RTL 语言：段落基方向 rtl，run 按视觉顺序镜像摆放，右对齐为默认；
 *  - 四种溢出模式 wrap / truncate / shrink / overflow；
 *  - 省略号参与宽度预算（truncate 时预留 … 的宽度）；
 *  - 输出逐 run 几何坐标，检测与绘制共用同一份结果。
 */
import type {
  HAlign,
  LaidLine,
  LaidRun,
  OverflowMode,
  RichRun,
  TextLayoutResult,
  VAlign,
  Widget,
} from '../types';
import {
  defaultDirectionForLang,
  Direction,
  graphemeClusters,
  isWhitespace,
  visualRuns,
} from './bidi';
import { FontRegistry, GraphicsLike, measureText, MeasuredCluster } from './fontResolver';

export interface EngineContext {
  registry: FontRegistry;
  g: GraphicsLike;
  lang: string;
}

interface StyledSegment {
  text: string;
  color?: string;
  bold?: boolean;
  italic?: boolean;
  icon?: { name: string; w: number; h: number };
}

interface PlacedCluster {
  cluster: MeasuredCluster;
  seg: StyledSegment;
}

const ELLIPSIS = '…';
const OBJECT_REPLACEMENT = 0xfffc;

export function layoutText(
  ctx: EngineContext,
  widget: Widget,
  runs: RichRun[],
  sourceRow: number,
  resolvedText: string,
): TextLayoutResult {
  const baseDir: Direction = widget.rtlMirror || ctx.lang === 'ar' ? 'rtl' : defaultDirectionForLang(ctx.lang);
  const contentRect = computeContentRect(widget, baseDir);
  const maxWidth = contentRect.w;

  // 1. 展开为带样式的簇序列（保留 \\n 边界）
  const segments = runs.map((r) => ({
    text: r.text,
    color: r.color ?? widget.color,
    bold: r.bold ?? widget.bold,
    italic: r.italic ?? widget.italic,
    icon: r.icon,
  }));

  const attempt = (fontSize: number): AttemptResult =>
    composeAtSize(ctx, widget, segments, contentRect, maxWidth, fontSize, baseDir);

  let result = attempt(widget.fontSize);
  let effectiveFontSize = widget.fontSize;

  // 2. shrink 模式：按 1px 步进缩小，下限 8px
  if (widget.overflow === 'shrink') {
    while (result.needsShrink && effectiveFontSize > 8) {
      effectiveFontSize -= 1;
      result = attempt(effectiveFontSize);
    }
  }

  const lines = result.lines;
  const allMissing = new Map<number, string>();
  for (const m of result.missing) allMissing.set(m.codePoint, m.char);

  // 3. 垂直对齐
  const totalTextHeight = lines.reduce((sum, l) => sum + l.height, 0);
  let startY: number;
  if (widget.vAlign === 'middle') startY = contentRect.y + Math.max(0, (contentRect.h - totalTextHeight) / 2);
  else if (widget.vAlign === 'bottom') startY = contentRect.y + Math.max(0, contentRect.h - totalTextHeight);
  else startY = contentRect.y;

  let cursorY = startY;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const line of lines) {
    line.y = cursorY;
    for (const r of line.runs) {
      r.y = cursorY;
      minX = Math.min(minX, r.x);
      minY = Math.min(minY, r.y);
      maxX = Math.max(maxX, r.x + r.width);
      maxY = Math.max(maxY, r.y + r.height);
    }
    cursorY += line.height;
  }

  const bounds =
    lines.length === 0
      ? { x: contentRect.x, y: contentRect.y, w: 0, h: 0 }
      : { x: minX, y: minY, w: maxX - minX, h: maxY - minY };

  const overflowed =
    widget.overflow === 'overflow'
      ? bounds.x < contentRect.x - 0.5 ||
        bounds.x + bounds.w > contentRect.x + contentRect.w + 0.5 ||
        bounds.y + bounds.h > contentRect.y + contentRect.h + 0.5
      : result.overflowed;

  return {
    widgetId: widget.id,
    lines,
    bounds,
    contentRect,
    effectiveFontSize,
    truncated: result.truncated,
    overflowed,
    missingGlyphs: [...allMissing.values()].map((char) => ({ char, codePoint: char.codePointAt(0)! })),
    sourceRow,
    textKey: widget.textKey,
    resolvedText,
  };
}

interface AttemptResult {
  lines: LaidLine[];
  truncated: boolean;
  overflowed: boolean;
  needsShrink: boolean;
  missing: { char: string; codePoint: number }[];
}

function composeAtSize(
  ctx: EngineContext,
  widget: Widget,
  segments: StyledSegment[],
  contentRect: { x: number; y: number; w: number; h: number },
  maxWidth: number,
  fontSize: number,
  baseDir: Direction,
): AttemptResult {
  const lineHeight = widget.lineHeight;
  const missing: { char: string; codePoint: number }[] = [];

  // 把每个 segment 切成带测量信息的簇
  const measured = segments.map((seg) => {
    const icons = seg.icon ? [seg.icon] : undefined;
    const m = measureText(ctx.registry, ctx.g, seg.text, {
      fontFamily: widget.fontFamily ?? 'GameUI',
      fontSize,
      bold: seg.bold,
      italic: seg.italic,
      letterSpacing: widget.letterSpacing,
      icons,
    });
    for (const cp of m.missing) missing.push({ char: String.fromCodePoint(cp), codePoint: cp });
    return m.clusters.map((cluster) => ({ cluster, seg }));
  });
  const allClusters: PlacedCluster[] = measured.flat();

  // 显式换行切分
  const paragraphs: PlacedCluster[][] = [];
  let para: PlacedCluster[] = [];
  for (const pc of allClusters) {
    if (pc.cluster.cluster === '\n') {
      paragraphs.push(para);
      para = [];
    } else {
      para.push(pc);
    }
  }
  paragraphs.push(para);

  // 省略号宽度与占位簇（truncate 预算 + 实际绘制）
  const ellipsisCluster = makeEllipsisCluster(ctx, widget, fontSize);
  const ellipsisWidth = ellipsisCluster.cluster.width;

  const rawLines: { items: PlacedCluster[]; width: number }[] = [];
  let truncated = false;

  for (const paragraph of paragraphs) {
    if (paragraph.length === 0) {
      rawLines.push({ items: [], width: 0 });
      continue;
    }
    const singleLine =
      widget.overflow === 'truncate' ||
      widget.overflow === 'shrink' ||
      (widget.overflow === 'wrap' && widget.maxLines === 1);
    if (singleLine) {
      if (widget.overflow === 'shrink') {
        // shrink：不截断、不留省略号，整行铺开；是否装得下交给缩字号循环
        const filled = fillLine(paragraph, Number.POSITIVE_INFINITY, 0);
        rawLines.push({ items: filled.items, width: filled.width });
      } else {
        // truncate（以及 wrap 单行）：为省略号预留宽度
        const filled = fillLine(paragraph, maxWidth, ellipsisWidth);
        if (filled.hadLeftover) {
          appendEllipsis(filled, ellipsisCluster, ellipsisWidth, maxWidth);
          truncated = true;
        }
        rawLines.push({ items: filled.items, width: filled.width });
      }
    } else if (widget.overflow === 'overflow') {
      // 放行模式：不换行不截断，整行铺开，越界由最终 bounds 判断
      const filled = fillLine(paragraph, Number.POSITIVE_INFINITY, 0);
      rawLines.push({ items: filled.items, width: filled.width });
    } else {
      // 自动换行
      const broken = wrapParagraph(paragraph, maxWidth);
      const maxLines = Math.max(1, widget.maxLines);
      for (let i = 0; i < broken.length; i++) {
        if (i < maxLines) {
          rawLines.push(broken[i]);
        } else {
          // 超出 maxLines：末行截断并追加省略号
          const last = rawLines[rawLines.length - 1];
          const extra = fillLine(
            broken.slice(i).flatMap((l) => l.items),
            maxWidth - last.width,
            ellipsisWidth,
          );
          last.items.push(...extra.items);
          last.width += extra.width;
          if (extra.hadLeftover || last.width + ellipsisWidth > maxWidth + 0.5) {
            appendEllipsis(last, ellipsisCluster, ellipsisWidth, maxWidth);
          }
          truncated = true;
          break;
        }
      }
    }
  }

  // 几何定位：水平对齐 + Bidi 视觉顺序
  const lines: LaidLine[] = rawLines.map((raw) =>
    positionLine(raw, widget, contentRect, maxWidth, fontSize, lineHeight, baseDir),
  );

  const totalHeight = lines.length * lineHeight;
  const widthExceeds = lines.some((l) => l.width > maxWidth + 0.5);
  const heightExceeds = totalHeight > contentRect.h + 0.5;

  const overflowed =
    widget.overflow === 'truncate'
      ? truncated
      : widget.overflow === 'overflow'
        ? false // overflow 模式的越界在最终 bounds 阶段判断
        : widget.overflow === 'shrink'
          ? widthExceeds || heightExceeds // 缩到下限仍装不下 → 超框
          : truncated || heightExceeds || widthExceeds;

  // shrink：只要还装得下就继续缩；其他模式不需要缩
  const needsShrink =
    widget.overflow === 'shrink' && (widthExceeds || heightExceeds);

  return { lines, truncated, overflowed, needsShrink, missing };
}

interface FillResult {
  items: PlacedCluster[];
  width: number;
  hadLeftover: boolean;
}

/**
 * 贪心把簇填进一行。
 * @param ellipsisReserve >0 时（truncate）为省略号预留该宽度，提前停止接收；
 *                         =0 时（shrink）尽力填满，是否装得下由 hadLeftover 告诉调用方。
 */
function fillLine(items: PlacedCluster[], maxWidth: number, ellipsisReserve: number): FillResult {
  const accepted: PlacedCluster[] = [];
  let width = 0;
  const limit = maxWidth - ellipsisReserve;
  let i = 0;
  for (; i < items.length; i++) {
    const pc = items[i];
    const w = pc.cluster.width;
    // 已超过整行宽度且行非空 → 停止（首个簇超宽时允许独占，交由 overflow 检测）
    if (accepted.length > 0 && width + w > maxWidth + 0.5) break;
    accepted.push(pc);
    width += w;
    // 需要省略号且已越过预留线，同时后面还有内容 → 停止，给 … 留位
    if (ellipsisReserve > 0 && width > limit + 0.5 && i < items.length - 1) break;
  }
  return { items: accepted, width, hadLeftover: i < items.length };
}

/** 构造省略号占位簇（样式跟随控件本身） */
function makeEllipsisCluster(ctx: EngineContext, widget: Widget, fontSize: number): PlacedCluster {
  const m = measureText(ctx.registry, ctx.g, ELLIPSIS, {
    fontFamily: widget.fontFamily ?? 'GameUI',
    fontSize,
    bold: widget.bold,
    italic: widget.italic,
  });
  return {
    cluster: m.clusters[0],
    seg: { text: ELLIPSIS, color: widget.color, bold: widget.bold, italic: widget.italic },
  };
}

/** 向已填充行追加省略号；空间不足时回退尾部簇 */
function appendEllipsis(
  filled: { items: PlacedCluster[]; width: number },
  ellipsis: PlacedCluster,
  ellipsisWidth: number,
  maxWidth: number,
): void {
  while (filled.items.length && filled.width + ellipsisWidth > maxWidth + 0.5) {
    const removed = filled.items.pop()!;
    filled.width -= removed.cluster.width;
  }
  filled.items.push(ellipsis);
  filled.width += ellipsisWidth;
}

/** 多词换行：在断行点（空格后/泰文-天城文簇边界）折行 */
function wrapParagraph(items: PlacedCluster[], maxWidth: number): { items: PlacedCluster[]; width: number }[] {
  const lines: { items: PlacedCluster[]; width: number }[] = [];
  let current: PlacedCluster[] = [];
  let width = 0;
  let lastBreak = -1;

  const pushLine = (endExclusive: number) => {
    const lineItems = current.slice(0, endExclusive);
    const lineWidth = lineItems.reduce((s, pc) => s + pc.cluster.width, 0);
    lines.push({ items: lineItems, width: lineWidth });
    current = current.slice(endExclusive);
    width = current.reduce((s, pc) => s + pc.cluster.width, 0);
    lastBreak = -1;
  };

  for (let i = 0; i < items.length; i++) {
    const pc = items[i];
    current.push(pc);
    width += pc.cluster.width;
    const cp = pc.cluster.codePoints[0];
    if (cp !== undefined && isWhitespace(cp)) lastBreak = current.length - 1;
    if (width > maxWidth + 0.5) {
      if (lastBreak > 0) {
        pushLine(lastBreak + 1);
      } else if (current.length > 1) {
        pushLine(current.length - 1);
      } else {
        // 单个簇就超宽：强制占一行
        lines.push({ items: current, width });
        current = [];
        width = 0;
        lastBreak = -1;
        continue;
      }
      // pushLine 后当前簇已被移入新行，回退 i 让 for 的 ++ 重新指向它，
      // 否则新行首簇会被跳过，导致后续断行点整体错位
      i -= 1;
    }
  }
  if (current.length) lines.push({ items: current, width });
  return lines;
}

/** 行内定位：合并相邻同段簇为 LaidRun，处理对齐与 Bidi 顺序 */
function positionLine(
  raw: { items: PlacedCluster[]; width: number },
  widget: Widget,
  contentRect: { x: number; y: number; w: number; h: number },
  maxWidth: number,
  fontSize: number,
  lineHeight: number,
  baseDir: Direction,
): LaidLine {
  const hAlign = effectiveHAlign(widget.hAlign, baseDir);
  let x: number;
  if (hAlign === 'center') x = contentRect.x + (maxWidth - raw.width) / 2;
  else if (hAlign === 'right') x = contentRect.x + maxWidth - raw.width;
  else x = contentRect.x;

  // Bidi：按视觉顺序重排整行（同一富文本 run 内若方向切换会被拆成多个 LaidRun）
  const logicalText = raw.items.map((pc) => pc.cluster.cluster).join('');
  const visRuns = visualRuns(logicalText, baseDir);
  const flat = raw.items;

  // 建立逻辑下标 → 簇 的映射
  const logical: PlacedCluster[] = [];
  let cursor = 0;
  for (const pc of flat) {
    const len = [...pc.cluster.cluster].length;
    logical.push(pc);
    cursor += len;
  }

  const laid: LaidRun[] = [];
  let visualIndex = 0;
  let logicalOffset = 0;
  // 计算每个逻辑簇的 x（LTR 假设下的位置），再按视觉顺序消费
  const logicalX: number[] = [];
  let xx = x;
  for (const pc of logical) {
    logicalX.push(xx);
    xx += pc.cluster.width;
  }

  if (baseDir === 'rtl') {
    // 视觉顺序反序：每个视觉 run 从右侧开始摆放
    let vx = contentRect.x + maxWidth;
    for (const vr of visRuns) {
      const start = vr.start;
      const len = [...vr.text].length;
      const slice = logical.slice(start, start + len);
      const sliceWidth = slice.reduce((s, pc) => s + pc.cluster.width, 0);
      vx -= sliceWidth;
      let rx = vx;
      // run 内部：RTL run 反序簇，LTR run 正序
      const ordered = vr.dir === 'rtl' ? slice.slice().reverse() : slice;
      for (const pc of ordered) {
        appendLaid(laid, pc, rx, fontSize, lineHeight, visualIndex++);
        rx += pc.cluster.width;
      }
      logicalOffset += len;
    }
  } else {
    for (const vr of visRuns) {
      const start = vr.start;
      const len = [...vr.text].length;
      const slice = logical.slice(start, start + len);
      let rx = logicalX[start] ?? x;
      for (const pc of slice) {
        appendLaid(laid, pc, rx, fontSize, lineHeight, visualIndex++);
        rx += pc.cluster.width;
      }
      logicalOffset += len;
    }
  }

  return { runs: laid, width: raw.width, height: lineHeight, y: 0, dir: baseDir };
}

function appendLaid(
  laid: LaidRun[],
  pc: PlacedCluster,
  x: number,
  fontSize: number,
  lineHeight: number,
  visualIndex: number,
): void {
  const last = laid[laid.length - 1];
  const fontCss = pc.cluster.font?.css.replace('{size}', String(fontSize)) ?? `${fontSize}px sans-serif`;
  if (
    last &&
    last.font === fontCss &&
    last.color === (pc.seg.color ?? null) &&
    !!last.bold === !!pc.seg.bold &&
    !!last.italic === !!pc.seg.italic &&
    !pc.cluster.isIcon &&
    !last.icon
  ) {
    last.text += pc.cluster.cluster;
    last.width += pc.cluster.width;
  } else {
    laid.push({
      text: pc.cluster.cluster,
      x,
      y: 0,
      width: pc.cluster.width,
      height: lineHeight,
      color: pc.seg.color,
      bold: pc.seg.bold,
      italic: pc.seg.italic,
      font: fontCss,
      fontSize,
      icon: pc.cluster.isIcon
        ? { name: pc.seg.icon?.name ?? 'icon', w: pc.cluster.iconW ?? 16, h: pc.cluster.iconH ?? 16 }
        : undefined,
      visualIndex,
    });
  }
}

function effectiveHAlign(hAlign: HAlign, baseDir: Direction): HAlign {
  // 游戏引擎常见行为：left/right 在 RTL 下镜像，center 不变
  if (baseDir === 'rtl') {
    if (hAlign === 'left') return 'right';
    if (hAlign === 'right') return 'left';
  }
  return hAlign;
}

function computeContentRect(widget: Widget, dir: Direction): { x: number; y: number; w: number; h: number } {
  const rtl = dir === 'rtl' && widget.rtlMirror !== false;
  const left = rtl ? widget.padding.right : widget.padding.left;
  const right = rtl ? widget.padding.left : widget.padding.right;
  return {
    x: widget.rect.x + left,
    y: widget.rect.y + widget.padding.top,
    w: Math.max(0, widget.rect.w - left - right),
    h: Math.max(0, widget.rect.h - widget.padding.top - widget.padding.bottom),
  };
}

export function overflowLabel(mode: OverflowMode): string {
  return { wrap: '自动换行', truncate: '截断省略', shrink: '自动缩字', overflow: '允许溢出' }[mode];
}

export function valignLabel(v: VAlign): string {
  return { top: '顶对齐', middle: '居中', bottom: '底对齐' }[v];
}
