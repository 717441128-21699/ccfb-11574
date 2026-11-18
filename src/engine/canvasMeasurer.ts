/**
 * 基于 CanvasRenderingContext2D 的 TextMeasurer。
 * - dir 设置后浏览器内部执行 UAX#9 与 shaping（HarfBuzz/系统引擎），
 *   泰文组合记号、天城文合字、阿语连写均由原生层保证；
 * - 测量结果按 (font字符串, 方向, 文本) 缓存，批处理命中率高；
 * - 回退链逐码点判定：一段文本可能拆成多个实际字体 run 分别测量后求和，
 *   与 FontResolver 的 cmap 判定保持一致。
 */
import { cssFontString, type TextMeasurer, type MeasuredRun } from '../core/measurer';
import { FontResolver } from '../core/measurer';
import type { Direction, RichSegment } from '../core/types';

interface CacheEntry {
  width: number;
}

export class CanvasTextMeasurer implements TextMeasurer {
  private cache = new Map<string, CacheEntry>();
  private metricsCache = new Map<string, { ascent: number; descent: number }>();

  constructor(
    private ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    private resolver: FontResolver,
    private languageFallback: string[],
  ) {}

  private key(font: string, dir: Direction, text: string): string {
    return `${dir}|${font}|${text}`;
  }

  private rawMeasure(text: string, familyStack: string[], seg: RichSegment, dir: Direction): number {
    const font = cssFontString(familyStack, seg.fontSize, seg.fontWeight, seg.italic);
    const k = this.key(font, dir, text);
    const hit = this.cache.get(k);
    if (hit) return hit.width;
    const prevFont = this.ctx.font;
    const prevDir = this.ctx.direction;
    this.ctx.font = font;
    this.ctx.direction = dir;
    const m = this.ctx.measureText(text);
    this.ctx.font = prevFont;
    this.ctx.direction = prevDir;
    this.cache.set(k, { width: m.width });
    return m.width;
  }

  measure(text: string, familyStack: string[], seg: RichSegment, direction: Direction): MeasuredRun {
    if (!text) return { width: 0, family: familyStack[0], families: [familyStack[0]], missing: [] };

    // 按码点切分字体 run（同命中族名的相邻码点合并）
    const codepoints = Array.from(text);
    const pieces: { text: string; family: string }[] = [];
    const families: string[] = [];
    let missing: number[] = [];

    for (const ch of codepoints) {
      const cp = ch.codePointAt(0)!;
      const resolved = this.resolver.resolveForCodepoint(
        seg.fontFamily,
        this.languageFallback,
        seg.fontWeight,
        seg.italic,
        cp,
      );
      const isMissing = !resolved.isSystem && resolved.coverage ? !resolved.coverage.covers(cp) : false;
      if (isMissing) missing.push(cp);
      if (!families.includes(resolved.family)) families.push(resolved.family);
      const last = pieces[pieces.length - 1];
      if (last && last.family === resolved.family) {
        last.text += ch;
      } else {
        pieces.push({ text: ch, family: resolved.family });
      }
    }

    let width = 0;
    for (const piece of pieces) {
      // 每片以“命中族名 + 语言回退栈”构造栈，保证片内仍可由浏览器二次回退
      const stack = [piece.family, ...this.languageFallback.filter((f) => f !== piece.family)];
      width += this.rawMeasure(piece.text, stack, seg, direction);
    }

    // 字间距在排版层按字素簇累加，这里只给字形宽度
    return { width, family: pieces[0]?.family ?? familyStack[0], families, missing };
  }

  lineMetrics(familyStack: string[], seg: RichSegment): { ascent: number; descent: number } {
    const font = cssFontString(familyStack, seg.fontSize, seg.fontWeight, seg.italic);
    const hit = this.metricsCache.get(font);
    if (hit) return hit;
    const prev = this.ctx.font;
    this.ctx.font = font;
    const m = this.ctx.measureText('Mg');
    this.ctx.font = prev;
    const ascent = m.fontBoundingBoxAscent || seg.fontSize * 0.9;
    const descent = m.fontBoundingBoxDescent || seg.fontSize * 0.3;
    const result = { ascent, descent };
    this.metricsCache.set(font, result);
    return result;
  }

  clearCache(): void {
    this.cache.clear();
    this.metricsCache.clear();
  }

  get cacheSize(): number {
    return this.cache.size;
  }
}
