/**
 * 文本测量抽象。排版内核只依赖 TextMeasurer 接口，
 * 浏览器/Worker 用 CanvasRenderingContext2D 实现，单测可注入假实现。
 */
import type { Direction, FontCoverage, FontDef, RichSegment } from './types';

export interface MeasuredRun {
  width: number;
  /** 首个 run 实际命中的字体族名 */
  family: string;
  /** 本次测量实际命中的全部字体族（去重，按出现顺序），用于回退判定 */
  families: string[];
  /** 该 run 中缺失的码点（仅内嵌字体可判定；系统字体返回空） */
  missing: number[];
}

export interface TextMeasurer {
  /**
   * 测量一段同样式文本。direction 决定 Canvas 的 dir，
   * 浏览器内部完成 shaping（泰文组合、天城文合字、阿语连写）。
   */
  measure(
    text: string,
    familyStack: string[],
    segment: RichSegment,
    direction: Direction,
  ): MeasuredRun;

  /** 字体族 + 字号下的行高（ascent + descent） */
  lineMetrics(familyStack: string[], segment: RichSegment): { ascent: number; descent: number };
}

export interface ResolvedFont {
  def: FontDef;
  /** 实际传给 Canvas font 字符串的族名（内嵌字体加载后是别名） */
  canvasFamily: string;
  isSystem: boolean;
}

export class FontResolver {
  private byFamily = new Map<string, FontDef[]>();

  constructor(fonts: FontDef[]) {
    for (const f of fonts) {
      const list = this.byFamily.get(f.family) ?? [];
      list.push(f);
      this.byFamily.set(f.family, list);
    }
  }

  /** 取某族名下最匹配 weight/style 的字体定义。 */
  resolveExact(family: string, weight: number, italic: boolean): FontDef | undefined {
    const list = this.byFamily.get(family);
    if (!list) return undefined;
    const score = (f: FontDef): number =>
      (f.weight === weight ? 0 : Math.abs(f.weight - weight)) + (f.style === (italic ? 'italic' : 'normal') ? 0 : 100);
    return [...list].sort((a, b) => score(a) - score(b))[0];
  }

  /**
   * 按回退链解析一个码点应使用的字体。
   * 内嵌字体用 cmap 精确判定；系统字体假定覆盖（浏览器自行回退）。
   * 返回命中的族名与是否发生回退。
   */
  resolveForCodepoint(
    requestedFamily: string,
    fallbackStack: string[],
    weight: number,
    italic: boolean,
    codepoint: number,
  ): { family: string; coverage: FontCoverage | undefined; isSystem: boolean; def: FontDef | undefined } {
    const chain = [requestedFamily, ...fallbackStack.filter((f) => f !== requestedFamily)];
    for (const family of chain) {
      const def = this.resolveExact(family, weight, italic);
      if (!def) {
        // 未知族名：当作系统字体，交给 Canvas 回退
        return { family, coverage: undefined, isSystem: true, def: undefined };
      }
      if (def.isSystem || !def.coverage) {
        return { family, coverage: undefined, isSystem: true, def };
      }
      if (def.coverage.covers(codepoint)) {
        return { family, coverage: def.coverage, isSystem: false, def };
      }
    }
    // 整条链都不覆盖：回到请求族名，交给浏览器 .notdef，同时上报缺字
    const first = this.resolveExact(requestedFamily, weight, italic);
    return {
      family: requestedFamily,
      coverage: first?.coverage,
      isSystem: !first?.coverage,
      def: first,
    };
  }
}

/** 构造 CSS font 简写字符串。 */
export function cssFontString(familyStack: string[], size: number, weight: number, italic: boolean): string {
  const families = familyStack.map((f) => (/[\s"'(),]/.test(f) ? `"${f.replace(/"/g, '\\"')}"` : f)).join(', ');
  return `${italic ? 'italic ' : ''}${weight} ${size}px ${families}`;
}
