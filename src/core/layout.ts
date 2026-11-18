/**
 * 排版引擎：把一个文本控件在指定语言/变量档案下排成行盒模型。
 *
 * 流水线：
 *   变量替换 → 富文本分段 → 基方向判定 → 原子项（字素簇/图标）展平
 *   → 逐原子测量（含字体回退、字间距）→ 贪心换行（词典/空格断点）
 *   → 省略/裁剪 → 行内 bidi 视觉重排 → 对齐与垂直定位
 *
 * 纯逻辑 + 注入的 TextMeasurer，不直接碰 DOM，可在 Node 下单测。
 */
import { getBaseDirection, splitBidiRuns } from './bidi';
import { analyzeBreaks, toGraphemeClusters } from './segment';
import { buildSegments, stripTags } from './richText';
import { substitute } from './variables';
import type { TextMeasurer } from './measurer';
import type {
  ControlDef,
  Direction,
  LaidLine,
  LaidRun,
  LanguageDef,
  Rect,
  RichSegment,
  TextComponentStyle,
  TextLayoutResult,
  VariableProfile,
} from './types';

export interface LayoutInput {
  screenId: string;
  control: ControlDef;
  resolvedStyle: TextComponentStyle;
  /** 控件绝对矩形（锚点解析后） */
  controlRect: Rect;
  template: string;
  language: LanguageDef;
  profile?: VariableProfile;
  icons: Record<string, { width: number; height: number }>;
  source: { file: string; row: number; key: string };
}

interface Atom {
  kind: 'grapheme' | 'icon' | 'space' | 'newline';
  text: string;
  segment: RichSegment;
  segmentIndex: number;
  /** 相对该段文本的偏移（图标为 0） */
  segOffset: number;
  /** 在“去标签可见纯文本”中的字节偏移 */
  visibleOffset: number;
  width: number;
  breakableBefore: boolean;
  direction: Direction;
}

interface PendingLine {
  atoms: Atom[];
  width: number;
  forcedBreak: boolean;
}

const ELLIPSIS = '…';

export function layoutText(input: LayoutInput, measurer: TextMeasurer): TextLayoutResult {
  const { control, resolvedStyle: style, controlRect, language, profile, icons } = input;

  // 1. 变量替换
  const values = profile?.values[language.code] ?? {};
  const sub = substitute(input.template, values);
  const resolvedText = sub.text;

  // 2. 富文本分段
  const segments = buildSegments(resolvedText, {
    baseFontFamily: style.fontFamily ?? 'sans-serif',
    baseFontSize: style.fontSize,
    baseFontWeight: style.fontWeight ?? 400,
    baseItalic: style.italic ?? false,
    baseColor: style.color ?? '#ffffff',
    icons,
  });

  // 3. 文本框（内边距 + 按钮内缩）
  const pad = style.padding ?? { left: 0, right: 0, top: 0, bottom: 0 };
  const inset = control.textFrameInset ?? 0;
  const textFrame: Rect = {
    x: pad.left + inset,
    y: pad.top + inset,
    width: Math.max(0, controlRect.width - pad.left - pad.right - inset * 2),
    height: Math.max(0, controlRect.height - pad.top - pad.bottom - inset * 2),
  };

  const lineHeight = style.lineHeight ?? style.fontSize * 1.2;
  const letterSpacing = style.letterSpacing ?? 0;

  // 4. 基方向
  const visiblePlain = stripTags(resolvedText);
  const baseDirection: Direction = language.forceDirection ?? getBaseDirection(visiblePlain);

  // 5. 展平原子项（携带去标签后的可见文本偏移）
  const fallbackTrace: TextLayoutResult['fallbackTrace'] = [];
  const missingGlyphs: TextLayoutResult['missingGlyphs'] = [];
  const atoms = flattenAtoms(
    segments,
    language,
    baseDirection,
    measurer,
    letterSpacing,
    fallbackTrace,
    missingGlyphs,
  );

  // 6. 断点分析（对可见纯文本做，保证词典断行能跨富文本段边界）
  const breaks = analyzeBreaks(visiblePlain, language.code, language.wordBreak === 'segmenter');
  for (const a of atoms) {
    if (a.kind === 'newline') continue;
    a.breakableBefore = breaks.opportunities[a.visibleOffset] === true;
  }

  // 7. 贪心换行
  const maxLines = style.maxLines;
  const pending = greedyLines(atoms, textFrame.width, style.overflow, !!maxLines);

  // 8. 省略/裁剪判定
  const lines = finalizeLines(
    pending,
    maxLines,
    textFrame.width,
    lineHeight,
    style,
    baseDirection,
    measurer,
    letterSpacing,
  );

  // 9. 垂直定位
  const totalTextHeight = lines.reduce((s, l) => s + l.height, 0);
  let yCursor: number;
  switch (style.verticalAlign) {
    case 'middle':
      yCursor = Math.max(0, (textFrame.height - totalTextHeight) / 2);
      break;
    case 'bottom':
      yCursor = Math.max(0, textFrame.height - totalTextHeight);
      break;
    default:
      yCursor = 0;
  }
  for (const l of lines) {
    l.y = yCursor;
    yCursor += l.height;
  }

  // 10. 内容边界
  const maxLineWidth = lines.reduce((m, l) => Math.max(m, l.width), 0);
  const contentBounds: Rect = {
    x: baseDirection === 'rtl' ? textFrame.width - maxLineWidth : 0,
    y: lines[0]?.y ?? 0,
    width: maxLineWidth,
    height: totalTextHeight,
  };

  return {
    controlId: control.id,
    screenId: input.screenId,
    language: language.code,
    profileId: profile?.id ?? 'none',
    direction: baseDirection,
    lines,
    contentBounds,
    textFrame,
    controlRect,
    resolvedText,
    fallbackTrace,
    missingGlyphs,
    source: input.source,
  };
}

function flattenAtoms(
  segments: RichSegment[],
  language: LanguageDef,
  baseDirection: Direction,
  measurer: TextMeasurer,
  letterSpacing: number,
  fallbackTrace: TextLayoutResult['fallbackTrace'],
  missingGlyphs: TextLayoutResult['missingGlyphs'],
): Atom[] {
  const atoms: Atom[] = [];
  let visibleOffset = 0;

  segments.forEach((seg, segmentIndex) => {
    const familyStack = [seg.fontFamily, ...language.fontStack.filter((f) => f !== seg.fontFamily)];

    if (seg.kind === 'icon') {
      atoms.push({
        kind: 'icon',
        text: '',
        segment: seg,
        segmentIndex,
        segOffset: 0,
        visibleOffset,
        width: seg.iconWidth ?? seg.fontSize,
        breakableBefore: true,
        direction: baseDirection,
      });
      // 图标来自标签，不在 stripTags 的可见纯文本中，不推进可见偏移
      return;
    }

    // bidi run 切分（段内）
    const runs = splitBidiRuns(seg.content, baseDirection);
    let tracedThisSegment = false;

    for (const run of runs) {
      const runText = seg.content.slice(run.start, run.end);
      const clusters = toGraphemeClusters(runText, language.code);
      for (const c of clusters) {
        const full = c.text;
        const isNL = full === '\n' || full === '\r';
        const isSpace = !isNL && /^\s+$/.test(full);
        const measured = measurer.measure(full, familyStack, seg, run.direction);
        for (const cp of measured.missing) {
          missingGlyphs.push({ char: String.fromCodePoint(cp), codepoint: cp, segmentIndex });
        }
        // 真实回退：命中字体里出现请求族名之外的字体，每段只记一条
        if (!tracedThisSegment && measured.families.some((f) => f !== seg.fontFamily)) {
          fallbackTrace.push({
            segmentIndex,
            requested: seg.fontFamily,
            resolvedStack: measured.families,
          });
          tracedThisSegment = true;
        }
        atoms.push({
          kind: isNL ? 'newline' : isSpace ? 'space' : 'grapheme',
          text: full,
          segment: seg,
          segmentIndex,
          segOffset: run.start + c.start,
          visibleOffset,
          width: measured.width + (isNL ? 0 : letterSpacing),
          breakableBefore: false,
          direction: run.direction,
        });
        visibleOffset += full.length;
      }
    }
  });

  return atoms;
}

function greedyLines(
  atoms: Atom[],
  frameWidth: number,
  overflow: TextComponentStyle['overflow'],
  hasMaxLines: boolean,
): PendingLine[] {
  const lines: PendingLine[] = [];
  let current: Atom[] = [];
  let currentWidth = 0;

  const widthOf = (list: Atom[]): number => list.reduce((s, a) => s + a.width, 0);
  const pushLine = (forcedBreak: boolean): void => {
    lines.push({ atoms: current, width: currentWidth, forcedBreak });
    current = [];
    currentWidth = 0;
  };
  /** 去掉行首空白 */
  const trimLineStart = (): void => {
    while (current.length > 0 && current[0].kind === 'space') {
      currentWidth -= current[0].width;
      current.shift();
    }
  };

  for (const atom of atoms) {
    if (atom.kind === 'newline') {
      pushLine(true);
      continue;
    }
    if (current.length === 0 && atom.kind === 'space') continue;

    if (currentWidth + atom.width <= frameWidth) {
      current.push(atom);
      currentWidth += atom.width;
      continue;
    }

    // 超宽：回溯最近可断点
    let breakAt = -1;
    for (let j = current.length - 1; j >= 1; j--) {
      if (current[j].breakableBefore) {
        breakAt = j;
        break;
      }
    }

    if (breakAt > 0) {
      const moved = current.splice(breakAt);
      pushLine(false);
      current = moved;
      trimLineStart();
      currentWidth = widthOf(current);
      if (!(current.length === 0 && atom.kind === 'space')) {
        current.push(atom);
        currentWidth += atom.width;
      }
    } else if (overflow === 'wrap' && !hasMaxLines) {
      // 无断点长词（如超长德语复合词、泰语词典未命中）：强制在字素簇边界断
      pushLine(false);
      current = [atom];
      currentWidth = atom.width;
    } else {
      // ellipsis/clip/overflow：保留在当前行，由 finalizeLines 决定省略/裁剪/超框
      current.push(atom);
      currentWidth += atom.width;
    }
  }
  if (current.length > 0 || lines.length === 0) pushLine(false);
  return lines;
}

function finalizeLines(
  pending: PendingLine[],
  maxLines: number | undefined,
  frameWidth: number,
  lineHeight: number,
  style: TextComponentStyle,
  baseDirection: Direction,
  measurer: TextMeasurer,
  letterSpacing: number,
): LaidLine[] {
  const limit = maxLines ?? pending.length;
  const kept = pending.slice(0, limit);
  const dropped = pending.slice(limit);
  const result: LaidLine[] = [];

  kept.forEach((pl, idx) => {
    let ellipsized = false;
    let clipped = false;
    let lineAtoms = pl.atoms;

    const isLastKept = idx === kept.length - 1;
    const hasMore = dropped.length > 0 || (isLastKept && pl.width > frameWidth);

    if (isLastKept && hasMore && style.overflow === 'ellipsis') {
      const ell = fitEllipsis(lineAtoms, frameWidth, measurer, letterSpacing, dropped.length > 0);
      lineAtoms = ell.atoms;
      ellipsized = ell.ellipsized;
    } else if (isLastKept && hasMore && style.overflow === 'clip') {
      lineAtoms = clipToWidth(lineAtoms, frameWidth);
      clipped = true;
    } else if (pl.width > frameWidth && style.overflow === 'clip') {
      lineAtoms = clipToWidth(lineAtoms, frameWidth);
      clipped = true;
    }

    const width = lineAtoms.reduce((s, a) => s + a.width, 0);
    const runs = composeRuns(lineAtoms, width, frameWidth, style, baseDirection);
    result.push({ runs, width, height: lineHeight, y: 0, ellipsized, clipped });
  });

  return result;
}

function fitEllipsis(
  atoms: Atom[],
  frameWidth: number,
  measurer: TextMeasurer,
  letterSpacing: number,
  force: boolean,
): { atoms: Atom[]; ellipsized: boolean } {
  const firstSeg = atoms[0]?.segment;
  if (!firstSeg) return { atoms, ellipsized: false };
  const ellWidth = measurer.measure(ELLIPSIS, [firstSeg.fontFamily], firstSeg, 'ltr').width + letterSpacing;

  let width = atoms.reduce((s, a) => s + a.width, 0);
  if (!force && width <= frameWidth) return { atoms, ellipsized: false };

  const trimmed = [...atoms];
  // 后续行被丢弃时即使本行没超宽也要补省略号；空间不足则逐字回退
  while (trimmed.length > 0 && width + ellWidth > frameWidth) {
    const removed = trimmed.pop()!;
    width -= removed.width;
  }
  // 追加省略号原子
  trimmed.push({
    kind: 'grapheme',
    text: ELLIPSIS,
    segment: firstSeg,
    segmentIndex: trimmed[0]?.segmentIndex ?? 0,
    segOffset: 0,
    visibleOffset: trimmed[0]?.visibleOffset ?? 0,
    width: ellWidth,
    breakableBefore: false,
    direction: 'ltr',
  });
  return { atoms: trimmed, ellipsized: true };
}

function clipToWidth(atoms: Atom[], frameWidth: number): Atom[] {
  const out: Atom[] = [];
  let width = 0;
  for (const a of atoms) {
    if (width + a.width > frameWidth) break;
    out.push(a);
    width += a.width;
  }
  return out;
}

/**
 * 行内组装：同段同方向的相邻原子合并成 LaidRun，
 * RTL 段落里对 run 序列做视觉反转（段级 bidi），
 * 再按对齐方式计算每个 run 的视觉 x。
 */
function composeRuns(
  atoms: Atom[],
  contentWidth: number,
  frameWidth: number,
  style: TextComponentStyle,
  baseDirection: Direction,
): LaidRun[] {
  interface RawRun {
    segment: RichSegment;
    text: string;
    width: number;
    direction: Direction;
    segmentIndex: number;
  }
  const raw: RawRun[] = [];
  for (const a of atoms) {
    const last = raw[raw.length - 1];
    if (last && last.segment === a.segment && last.direction === a.direction && a.kind !== 'icon') {
      last.text += a.text;
      last.width += a.width;
    } else if (a.kind === 'icon') {
      raw.push({ segment: a.segment, text: '', width: a.width, direction: a.direction, segmentIndex: a.segmentIndex });
    } else {
      raw.push({
        segment: a.segment,
        text: a.text,
        width: a.width,
        direction: a.direction,
        segmentIndex: a.segmentIndex,
      });
    }
  }

  // 视觉顺序：RTL 段落反转 run 序列（图标/中性块随段落方向）
  const ordered = baseDirection === 'rtl' ? [...raw].reverse() : raw;

  // 对齐起点
  const align = style.align ?? (baseDirection === 'rtl' ? 'right' : 'left');
  let x: number;
  if (align === 'center') x = (frameWidth - contentWidth) / 2;
  else if (align === 'right') x = frameWidth - contentWidth;
  else x = 0;

  return ordered.map((r) => {
    const run: LaidRun = {
      segment: r.segment,
      text: r.text,
      x,
      width: r.width,
      direction: r.direction,
    };
    x += r.width;
    return run;
  });
}
