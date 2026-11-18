/**
 * 断行与字素簇切分，基于 Intl.Segmenter。
 * - 泰语/老挝语/缅甸语等无空格语言：word 粒度给出词典断词机会；
 * - 泰语/印地语组合记号：grapheme 粒度保证组合字符不被拆开，
 *   换行与省略号都在字素簇边界进行；
 * - 环境缺少 Intl.Segmenter 时退化为正则实现。
 */

export interface BreakMap {
  /** 长度 = text.length + 1，true 表示该字节位置允许断行 */
  opportunities: boolean[];
  /** 字素簇边界（字节下标），含 0 与 text.length */
  graphemeBoundaries: number[];
}

let segmenterCache: Map<string, Intl.Segmenter> | undefined;

function getSegmenter(locale: string, granularity: 'grapheme' | 'word'): Intl.Segmenter | undefined {
  if (typeof Intl === 'undefined' || typeof Intl.Segmenter === 'undefined') return undefined;
  segmenterCache ??= new Map();
  const key = `${locale}:${granularity}`;
  let seg = segmenterCache.get(key);
  if (!seg) {
    seg = new Intl.Segmenter(locale, { granularity });
    segmenterCache.set(key, seg);
  }
  return seg;
}

const FALLBACK_WORD = /\s+/y;

/** 退化方案：代理对感知的字素簇（不处理组合记号附着，仅保证不拆代理对）。 */
function fallbackGraphemes(text: string): number[] {
  const boundaries = [0];
  for (let i = 0; i < text.length; ) {
    const cp = text.codePointAt(i)!;
    i += cp > 0xffff ? 2 : 1;
    // 吞掉后续组合记号
    while (i < text.length) {
      const next = text.codePointAt(i)!;
      if (isCombiningMark(next)) i += next > 0xffff ? 2 : 1;
      else break;
    }
    boundaries.push(i);
  }
  return boundaries;
}

function isCombiningMark(cp: number): boolean {
  return (
    (cp >= 0x0300 && cp <= 0x036f) ||
    (cp >= 0x1ab0 && cp <= 0x1aff) ||
    (cp >= 0x1dc0 && cp <= 0x1dff) ||
    (cp >= 0x20d0 && cp <= 0x20ff) ||
    (cp >= 0xfe20 && cp <= 0xfe2f)
  );
}

export function analyzeBreaks(text: string, locale: string, useDictionary: boolean): BreakMap {
  const opportunities = new Array<boolean>(text.length + 1).fill(false);
  opportunities[0] = true;
  opportunities[text.length] = true;

  // 1. 字素簇边界
  const gSeg = getSegmenter(locale, 'grapheme');
  let graphemeBoundaries: number[];
  if (gSeg) {
    graphemeBoundaries = [0];
    for (const s of gSeg.segment(text)) graphemeBoundaries.push(s.index + s.segment.length);
  } else {
    graphemeBoundaries = fallbackGraphemes(text);
  }

  // 2. 断行机会
  const wSeg = getSegmenter(locale, 'word');
  if (wSeg && useDictionary) {
    // 词典分词：每个 word-like 片段之后可断；空白段起止均可断
    for (const s of wSeg.segment(text)) {
      if (s.isWordLike) opportunities[s.index + s.segment.length] = true;
      else if (/\s/.test(s.segment)) {
        opportunities[s.index] = true;
        opportunities[s.index + s.segment.length] = true;
      }
    }
  } else if (wSeg) {
    // 空格语言：空白段的起点与终点都允许断行
    // （起点断行时空格落到新行行首被吞掉，终点断行时空格留在上行行尾）
    for (const s of wSeg.segment(text)) {
      if (/\s/.test(s.segment)) {
        opportunities[s.index] = true;
        opportunities[s.index + s.segment.length] = true;
      }
    }
  } else {
    FALLBACK_WORD.lastIndex = 0;
    for (let i = 0; i < text.length; i++) {
      FALLBACK_WORD.lastIndex = i;
      const m = FALLBACK_WORD.exec(text);
      if (m && m.index === i) {
        opportunities[i + m[0].length] = true;
        i += m[0].length - 1;
      }
    }
  }

  // 显式换行符：强制断点
  for (let i = 0; i < text.length; i++) {
    const cp = text.charCodeAt(i);
    if (cp === 0x0a || cp === 0x0d || cp === 0x85) opportunities[i + 1] = true;
  }

  // 断点只能落在字素簇边界上
  const boundarySet = new Set(graphemeBoundaries);
  for (let i = 0; i < opportunities.length; i++) {
    if (opportunities[i] && !boundarySet.has(i)) opportunities[i] = false;
  }

  return { opportunities, graphemeBoundaries };
}

/** 把文本切成字素簇字符串数组（保留原下标信息）。 */
export function toGraphemeClusters(text: string, locale: string): { text: string; start: number; end: number }[] {
  const seg = getSegmenter(locale, 'grapheme');
  if (seg) {
    return [...seg.segment(text)].map((s) => ({
      text: s.segment,
      start: s.index,
      end: s.index + s.segment.length,
    }));
  }
  const boundaries = fallbackGraphemes(text);
  return boundaries.slice(0, -1).map((start, i) => ({
    text: text.slice(start, boundaries[i + 1]),
    start,
    end: boundaries[i + 1],
  }));
}
