/**
 * 简化版 Unicode 双向算法（UAX #9）与复杂文字簇切分工具。
 *
 * 目的不是完整实现 ICU：浏览器 Canvas 在 fillText 时会自行做 shaping
 * （泰语/印地语组合字形、阿拉伯语字形选择都由平台文本栈完成），本模块负责：
 *  1. 判断字符串/段落的基方向（RTL 语言界面用）；
 *  2. 给出段落内强方向字符的视觉顺序，让分段测量与逐段绘制顺序正确；
 *  3. 按字素簇（grapheme cluster）切分，保证组合记号/ZWJ 连写不会被拆断；
 *  4. 阿拉伯文数字、弱类型字符按 X 规则处理的近似版本。
 */

export type Direction = 'ltr' | 'rtl';

/** 码点是否属于阿拉伯文区块（含补充区与展示形式区） */
export function isArabic(cp: number): boolean {
  return (
    (cp >= 0x0600 && cp <= 0x06ff) ||
    (cp >= 0x0750 && cp <= 0x077f) ||
    (cp >= 0x08a0 && cp <= 0x08ff) ||
    (cp >= 0xfb50 && cp <= 0xfdff) ||
    (cp >= 0xfe70 && cp <= 0xfeff)
  );
}

/** 希伯来文等其他 RTL 脚本 */
export function isHebrew(cp: number): boolean {
  return (cp >= 0x0590 && cp <= 0x05ff) || (cp >= 0xfb1d && cp <= 0xfb4f);
}

export function isRtlScript(cp: number): boolean {
  return isArabic(cp) || isHebrew(cp);
}

/** 欧洲数字（含阿拉伯-印度数字之外的 ASCII 数字） */
export function isEuropeanDigit(cp: number): boolean {
  return (
    (cp >= 0x30 && cp <= 0x39) || // 0-9
    (cp >= 0x06f0 && cp <= 0x06f9) // 扩展阿拉伯-印度数字
  );
}

/** 阿拉伯-印度数字 ٠-٩（在 RTL 文本中数字仍 LTR，但用本地字形） */
export function isArabicIndicDigit(cp: number): boolean {
  return cp >= 0x0660 && cp <= 0x0669;
}

export type BidiType = 'R' | 'AL' | 'L' | 'EN' | 'ES' | 'CS' | 'ET' | 'AN' | 'ON' | 'WS' | 'NSM' | 'B';

export function bidiType(cp: number): BidiType {
  if (isArabic(cp)) return 'AL';
  if (isHebrew(cp)) return 'R';
  if (isArabicIndicDigit(cp)) return 'AN';
  if (isEuropeanDigit(cp)) return 'EN';
  if (cp === 0x2b || cp === 0x2d) return 'ES'; // + -
  if (cp === 0x2c || cp === 0x2e || cp === 0x3a || cp === 0x2f) return 'CS'; // , . : /
  if (cp === 0x09 || cp === 0x0a || cp === 0x0d || cp === 0x20) return 'WS';
  if (cp === 0x0a || cp === 0x0d || cp === 0x2028 || cp === 0x2029) return 'B';
  if (isCombiningMark(cp)) return 'NSM';
  // 拉丁、西里尔、希腊、泰文、天城文、CJK 等均按 L 处理
  return 'L';
}

/** 组合记号 / 零宽连接符 —— 不能独立断行或拆字 */
export function isCombiningMark(cp: number): boolean {
  return (
    (cp >= 0x0300 && cp <= 0x036f) || // 通用组合附加
    (cp >= 0x064b && cp <= 0x065f) || // 阿拉伯元音
    cp === 0x0670 ||
    (cp >= 0x06d6 && cp <= 0x06dc) ||
    (cp >= 0x06df && cp <= 0x06e4) ||
    (cp >= 0x06e7 && cp <= 0x06e8) ||
    (cp >= 0x06ea && cp <= 0x06ed) ||
    (cp >= 0x07eb && cp <= 0x07f3) ||
    (cp >= 0xfe20 && cp <= 0xfe2f) // 组合半角记号
  );
}

/** 泰文区块（含组合元音、声调符号，需整体 shaping） */
export function isThai(cp: number): boolean {
  return cp >= 0x0e00 && cp <= 0x0e7f;
}

/** 天城文（印地语）区块 */
export function isDevanagari(cp: number): boolean {
  return (cp >= 0x0900 && cp <= 0x097f) || (cp >= 0xa8e0 && cp <= 0xa8ff);
}

export const ZWJ = 0x200d;
export const ZWNJ = 0x200c;
export function isZeroWidthJoiner(cp: number): boolean {
  return cp === ZWJ || cp === ZWNJ;
}

/**
 * 段落基方向：取第一个强方向字符（R/AL → rtl，L → ltr）。
 * 无强字符时回退到调用方给定的默认方向。
 */
export function paragraphDirection(text: string, defaultDir: Direction = 'ltr'): Direction {
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    const t = bidiType(cp);
    if (t === 'R' || t === 'AL') return 'rtl';
    if (t === 'L') return 'ltr';
  }
  return defaultDir;
}

export interface BidiRun {
  /** 逻辑顺序的文本片段 */
  text: string;
  dir: Direction;
  /** 在原字符串中的逻辑起始下标 */
  start: number;
}

/**
 * 最小可用的方向分段：把字符串切成同向 run。
 * NSM 跟随前一个 run 的方向；数字在 RTL 段内保持 LTR 但不拆段
 * （Canvas 按 run 绘制时数字的内部顺序由平台保证）。
 */
export function bidiRuns(text: string, baseDir: Direction): BidiRun[] {
  const runs: BidiRun[] = [];
  const chars = Array.from(text);
  let i = 0;
  while (i < chars.length) {
    const cp = chars[i].codePointAt(0)!;
    let t = bidiType(cp);
    if (t === 'NSM' && runs.length > 0) {
      runs[runs.length - 1].text += chars[i];
      i++;
      continue;
    }
    let dir: Direction;
    if (t === 'R' || t === 'AL') dir = 'rtl';
    else if (t === 'L' || t === 'EN' || t === 'AN') dir = 'ltr';
    else dir = baseDir; // 中性/标点跟随段落基方向
    const start = i;
    let buf = chars[i];
    i++;
    while (i < chars.length) {
      const ncp = chars[i].codePointAt(0)!;
      const nt = bidiType(ncp);
      if (nt === 'NSM') {
        buf += chars[i];
        i++;
        continue;
      }
      let ndir: Direction;
      if (nt === 'R' || nt === 'AL') ndir = 'rtl';
      else if (nt === 'L' || nt === 'EN' || nt === 'AN') ndir = 'ltr';
      else ndir = baseDir;
      if (ndir !== dir) break;
      buf += chars[i];
      i++;
    }
    runs.push({ text: buf, dir, start });
  }
  return runs;
}

/**
 * 按段落基方向决定 run 的视觉顺序。
 * RTL 段落整体反序；中性 run 已在分段时跟随基方向，因此这里直接镜像即可。
 */
export function visualRuns(text: string, baseDir: Direction): BidiRun[] {
  const runs = bidiRuns(text, baseDir);
  return baseDir === 'rtl' ? runs.reverse() : runs;
}

/**
 * 字素簇切分（UAX #29 的实用子集）。
 * 覆盖：组合记号、ZWJ/ZWNJ 连写、泰文/天城文附加符号、变体选择符、Emoji 修饰与 ZWJ 序列。
 * 返回每个簇在字符串中的起止（按码点字符计的下标，配合 Array.from 使用）。
 */
export function graphemeClusters(text: string): { text: string; start: number; end: number }[] {
  const chars = Array.from(text);
  const out: { text: string; start: number; end: number }[] = [];
  let i = 0;
  while (i < chars.length) {
    const start = i;
    let buf = chars[i];
    i++;
    while (i < chars.length) {
      const cp = chars[i].codePointAt(0)!;
      const prev = chars[i - 1].codePointAt(0)!;
      const extendsCluster =
        isCombiningMark(cp) ||
        isZeroWidthJoiner(cp) ||
        isVariationSelector(cp) ||
        isEmojiModifier(cp) ||
        // 区域指示符成对（旗帜）
        (isRegionalIndicator(cp) && isRegionalIndicator(prev)) ||
        // ZWJ 后接零宽连接序列的下一个 Emoji 元素
        (prev === ZWJ && (isEmojiBase(cp) || isEmojiModifier(cp) || isRegionalIndicator(cp) || isVariationSelector(cp))) ||
        // 泰文/天城文：上标元音与声调附着在前辅音上
        (isThai(cp) && isThaiMark(cp)) ||
        (isDevanagari(cp) && isDevanagariMark(cp));
      if (!extendsCluster) break;
      buf += chars[i];
      i++;
    }
    out.push({ text: buf, start, end: i });
  }
  return out;
}

export function isVariationSelector(cp: number): boolean {
  return (cp >= 0xfe00 && cp <= 0xfe0f) || (cp >= 0xe0100 && cp <= 0xe01ef);
}

export function isEmojiModifier(cp: number): boolean {
  return cp >= 0x1f3fb && cp <= 0x1f3ff;
}

export function isRegionalIndicator(cp: number): boolean {
  return cp >= 0x1f1e6 && cp <= 0x1f1ff;
}

/** Emoji 主字符（表情/符号/人像等，ZWJ 序列的连接主体） */
export function isEmojiBase(cp: number): boolean {
  return (
    (cp >= 0x1f300 && cp <= 0x1f6ff) ||
    (cp >= 0x1f700 && cp <= 0x1f77f) ||
    (cp >= 0x1f780 && cp <= 0x1f7ff) ||
    (cp >= 0x1f800 && cp <= 0x1f8ff) ||
    (cp >= 0x1f900 && cp <= 0x1f9ff) ||
    (cp >= 0x1fa00 && cp <= 0x1fa6f) ||
    (cp >= 0x2600 && cp <= 0x27bf)
  );
}

export function isThaiMark(cp: number): boolean {
  // 泰文上方/下方元音与声调符号（辅音 0x0E01-0x0E2E 不在此列）
  return (
    cp === 0x0e31 ||
    cp === 0x0e33 || // Sara Am（含固有元音的组合符号）
    (cp >= 0x0e34 && cp <= 0x0e3a) ||
    (cp >= 0x0e47 && cp <= 0x0e4e)
  );
}

export function isDevanagariMark(cp: number): boolean {
  // 天城文元音符号、鼻音/送气记号、 nukta
  return (
    (cp >= 0x0900 && cp <= 0x0903) ||
    (cp >= 0x093a && cp <= 0x093c) ||
    (cp >= 0x093e && cp <= 0x094f) ||
    (cp >= 0x0951 && cp <= 0x0957) ||
    (cp >= 0x0962 && cp <= 0x0963)
  );
}

export function isWhitespace(cp: number): boolean {
  const t = bidiType(cp);
  return t === 'WS' || t === 'B';
}

/** 可断行点：空格之后，或泰文/天城文这类无空格文字的字素簇边界 */
export function isBreakOpportunity(text: string, clusterIndex: number): boolean {
  const chars = Array.from(text);
  if (clusterIndex === 0) return false;
  const prev = chars[clusterIndex - 1].codePointAt(0)!;
  if (isWhitespace(prev)) return true;
  const cp = chars[clusterIndex]?.codePointAt(0) ?? 0;
  // 泰语/印地语词内断行：浏览器 measureText 无法给词边界，
  // 退而求其次在辅音起点断开（声调/元音附着簇不可断）。
  if (isThai(cp) && !isThaiMark(cp)) return true;
  if (isDevanagari(cp) && !isDevanagariMark(cp) && !isZeroWidthJoiner(cp)) return true;
  return false;
}

/** 语言 → 默认段落方向 */
export function defaultDirectionForLang(lang: string): Direction {
  return lang === 'ar' ? 'rtl' : 'ltr';
}
