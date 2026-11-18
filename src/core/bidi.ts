/**
 * 双向文本（bidi）处理。
 *
 * 完整 UAX#9 由 Canvas 内部对纯文本 run 执行；本模块负责：
 * 1. 段落基方向判定（首强字符规则，对应 UAX#9 P2/P3）；
 * 2. 富文本多色段的方向 run 切分，用于分段着色绘制与宽度占位。
 *
 * 这是面向游戏 UI 常见文案的实用子集：强字符 L/R/AL、欧洲数字 EN、
 * 阿拉伯-印度数字 AN、空白与中性符按相邻强方向合并。
 * 隔离符/覆盖符等显式格式化文本不在支持范围（游戏文案几乎不使用）。
 */
import type { Direction } from './types';

export interface BidiRun {
  /** 相对输入文本的下标区间 [start, end) */
  start: number;
  end: number;
  direction: Direction;
}

/* eslint-disable @typescript-eslint/naming-convention */
type BidiType = 'L' | 'R' | 'AL' | 'EN' | 'AN' | 'ES' | 'CS' | 'ET' | 'ON' | 'WS' | 'BN' | 'B';
/* eslint-enable @typescript-eslint/naming-convention */

function bidiType(cp: number): BidiType {
  // 阿拉伯文（含 Presentation Forms）
  if (
    (cp >= 0x0600 && cp <= 0x06ff) ||
    (cp >= 0x0750 && cp <= 0x077f) ||
    (cp >= 0x08a0 && cp <= 0x08ff) ||
    (cp >= 0xfb50 && cp <= 0xfdff) ||
    (cp >= 0xfe70 && cp <= 0xfeff)
  ) {
    // 阿拉伯-印度数字 ٠٩ (U+0660–0669) 为 AN；其余 AL
    if (cp >= 0x0660 && cp <= 0x0669) return 'AN';
    return 'AL';
  }
  // 希伯来文
  if ((cp >= 0x0590 && cp <= 0x05ff) || (cp >= 0xfb1d && cp <= 0xfb4f)) return 'R';
  // 阿拉伯-印度数字扩展（U+06F0–06F9）
  if (cp >= 0x06f0 && cp <= 0x06f9) return 'AN';
  // 欧洲数字
  if (cp >= 0x0030 && cp <= 0x0039) return 'EN';
  // 分隔/数字相关弱类型
  if (cp === 0x2b || cp === 0x2d) return 'ES'; // + -
  if (cp === 0x2c || cp === 0x2e || cp === 0x3a || cp === 0x2044) return 'CS'; // , . : ⁄
  if (cp === 0x24 || (cp >= 0x00a2 && cp <= 0x00a5)) return 'ET';
  // 段落/换行
  if (cp === 0x0a || cp === 0x0d || cp === 0x85 || cp === 0x2028 || cp === 0x2029) return 'B';
  // 各类空白
  if (
    cp === 0x20 ||
    cp === 0x09 ||
    cp === 0x0c ||
    cp === 0x1680 ||
    (cp >= 0x2000 && cp <= 0x200a) ||
    cp === 0x202f ||
    cp === 0x205f ||
    cp === 0x3000
  ) {
    return 'WS';
  }
  // 中性/格式符（含零宽、组合记号、标点）
  if (
    (cp >= 0x0300 && cp <= 0x036f) ||
    (cp >= 0x200b && cp <= 0x0200f) ||
    (cp >= 0x202a && cp <= 0x202e) ||
    (cp >= 0x2060 && cp <= 0x2069) ||
    (cp >= 0xfe00 && cp <= 0xfe0f) ||
    (cp >= 0x2070 && cp <= 0x207f) ||
    (cp >= 0x2080 && cp <= 0x208f) ||
    cp === 0x00a0 ||
    cp === 0x00b7 ||
    cp === 0xfffd
  ) {
    return 'ON';
  }
  // 拉丁、西里尔、希腊、泰文、天城文、CJK 等一律 L
  return 'L';
}

/**
 * 段落基方向：第一个强字符（L / R / AL）决定；无强字符时取默认值。
 * 对应 UAX#9 P2/P3 的实用实现。
 */
export function getBaseDirection(text: string, fallback: Direction = 'ltr'): Direction {
  for (const ch of text) {
    const t = bidiType(ch.codePointAt(0)!);
    if (t === 'R' || t === 'AL') return 'rtl';
    if (t === 'L') return 'ltr';
  }
  return fallback;
}

function resolveType(t: BidiType, base: Direction): Direction | undefined {
  if (t === 'L') return 'ltr';
  if (t === 'R' || t === 'AL') return 'rtl';
  if (t === 'EN') return 'ltr'; // 欧洲数字在任何段落里视觉上都是 LTR run
  if (t === 'AN') return base === 'rtl' ? 'rtl' : 'ltr';
  return undefined; // 弱/中性，待相邻方向决定
}

/**
 * 切分方向 run。中性/空白序列：两侧同向则并入该方向，
 * 异向或贴边则取段落基方向（对应 UAX#9 中性规则的简化版）。
 */
export function splitBidiRuns(text: string, base: Direction): BidiRun[] {
  const chars = Array.from(text);
  const dirs: (Direction | undefined)[] = chars.map((ch) =>
    resolveType(bidiType(ch.codePointAt(0)!), base),
  );

  // 第一遍：给未决位置填方向
  for (let i = 0; i < dirs.length; i++) {
    if (dirs[i]) continue;
    let left: Direction | undefined;
    for (let j = i - 1; j >= 0; j--) {
      if (dirs[j]) {
        left = dirs[j];
        break;
      }
    }
    let right: Direction | undefined;
    for (let j = i + 1; j < dirs.length; j++) {
      const t = bidiType(chars[j].codePointAt(0)!);
      const d = resolveType(t, base);
      if (d) {
        right = d;
        break;
      }
    }
    dirs[i] = left && left === right ? left : base;
  }

  // 第二遍：合并相邻同向 run（按码点下标，注意代理对）
  const runs: BidiRun[] = [];
  let charStart = 0;
  let byteStart = 0;
  for (let i = 1; i <= chars.length; i++) {
    if (i < chars.length && dirs[i] === dirs[charStart]) continue;
    let byteEnd = byteStart;
    for (let k = charStart; k < i; k++) byteEnd += chars[k].length;
    runs.push({ start: byteStart, end: byteEnd, direction: dirs[charStart]! });
    if (i < chars.length) {
      charStart = i;
      byteStart = byteEnd;
    }
  }
  return runs;
}
