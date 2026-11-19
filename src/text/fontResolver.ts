/**
 * 字体回退解析与文本测量。
 *
 * 三级覆盖判断：
 *  1. 嵌入字体：从 cmap 静态解析出码点集合，精确判断；
 *  2. 系统字体：FontFaceSet.check() 运行时探测（浏览器会走自身回退，
 *     因此再配合 Unicode 区块启发式规则，避免把"系统兜底能渲染"误判成该字体支持）；
 *  3. 都无法确认时按"可用"处理，并在调试日志里记录，避免误报淹没真实问题。
 *
 * 测量时把连续使用同一字体的字素簇合并为一段 measureText，保留
 * kerning/ligature 与复杂文字 shaping（泰文、天城文、阿拉伯文）。
 */
import type { FontConfig, SerializedFontConfig, UnicodeRangeRule } from '../types';
import { graphemeClusters, isCombiningMark, isZeroWidthJoiner } from './bidi';
import { extractCoverage } from './fontCmap';

export interface ResolvedFont {
  /** 用于 ctx.font 的 CSS 字体栈 */
  css: string;
  /** 逻辑族名（嵌入字体为注册名，系统字体取栈首） */
  family: string;
  weight: number;
  style: 'normal' | 'italic';
}

interface LoadedFace {
  family: string;
  weight: number;
  style: 'normal' | 'italic';
  coverage: Set<number> | null; // null = 无法静态解析
}

/** Unicode 区块启发式：常见系统字体的覆盖范围声明 */
const DEFAULT_HEURISTICS: Record<string, UnicodeRangeRule[]> = {
  arabic: [
    {
      ranges: [
        [0x0600, 0x06ff],
        [0x0750, 0x077f],
        [0x08a0, 0x08ff],
        [0xfb50, 0xfdff],
        [0xfe70, 0xfeff],
      ],
      covers: true,
    },
  ],
  thai: [{ ranges: [[0x0e00, 0x0e7f]], covers: true }],
  devanagari: [{ ranges: [[0x0900, 0x097f], [0xa8e0, 0xa8ff]], covers: true }],
  cjk: [
    {
      ranges: [
        [0x2e80, 0x2fff],
        [0x3000, 0x303f],
        [0x3040, 0x30ff],
        [0x3400, 0x4dbf],
        [0x4e00, 0x9fff],
        [0xff00, 0xffef],
      ],
      covers: true,
    },
  ],
};

export class FontRegistry {
  /** 逻辑族名 → 字体配置 */
  private configs = new Map<string, FontConfig>();
  /** 已加载的嵌入字体（注册名唯一） */
  private faces: LoadedFace[] = [];
  /** 运行时探测缓存：family|cp → 结果 */
  private probeCache = new Map<string, boolean>();
  /** 标记嵌入字体是否已注册到 document/worker 字体集 */
  private registered = new Set<string>();
  private gfx: GraphicsLike | null = null;

  registerConfig(config: FontConfig): void {
    this.configs.set(config.family, config);
  }

  getConfig(family: string): FontConfig | undefined {
    return this.configs.get(family);
  }

  listFamilies(): string[] {
    return [...this.configs.keys()];
  }

  /** 加载嵌入字体（ArrayBuffer → FontFace + cmap 解析） */
  async loadEmbedded(
    family: string,
    weight: number,
    style: 'normal' | 'italic',
    data: ArrayBuffer,
    target: FontFaceTarget = globalThis,
  ): Promise<void> {
    const face = new FontFace(family, data, { weight: String(weight), style });
    await face.load();
    addToFontFaceSet(target, face);
    const coverage = await extractCoverage(data);
    this.faces.push({ family, weight, style, coverage });
    this.registered.add(`${family}:${weight}:${style}`);
  }

  /** 从序列化配置（worker 传参）重建 */
  async hydrate(serialized: SerializedFontConfig[], target: FontFaceTarget = globalThis): Promise<void> {
    for (const cfg of serialized) {
      const config: FontConfig = {
        family: cfg.family,
        cssStack: cfg.cssStack,
        embedded: [],
        fallbacks: cfg.fallbacks.map((f) => ({
          family: f.family,
          cssStack: f.cssStack,
          heuristic: f.heuristic,
        })),
      };
      for (const emb of cfg.embedded) {
        if (!emb.data) continue;
        try {
          await this.loadEmbedded(emb.family, emb.weight, emb.style, emb.data, target);
          config.embedded.push({
            family: emb.family,
            weight: emb.weight,
            style: emb.style,
            coverage: this.faces.find((f) => f.family === emb.family && f.weight === emb.weight)?.coverage ?? undefined,
          });
        } catch (err) {
          console.warn(`字体 ${emb.family} 加载失败，将仅使用系统回退`, err);
        }
      }
      this.registerConfig(config);
    }
  }

  /** 供测量模块绑定 CanvasRenderingContext2D / OffscreenCanvasRenderingContext2D */
  bindGraphics(g: GraphicsLike): void {
    this.gfx = g;
  }

  /**
   * 解析单个码点应该用哪个字体。
   * 返回 null 表示整条回退链都无法确认覆盖（缺字）。
   */
  resolveCodePoint(
    cp: number,
    family: string,
    bold: boolean,
    italic: boolean,
  ): { font: ResolvedFont; embedded: boolean } | null {
    const weight = bold ? 700 : 400;
    const style: 'normal' | 'italic' = italic ? 'italic' : 'normal';
    const config = this.configs.get(family);
    const chain: { family: string; cssStack: string[]; heuristic?: UnicodeRangeRule[]; embedded: boolean }[] = [];

    if (config) {
      chain.push({ family: config.family, cssStack: config.cssStack, embedded: true });
      for (const fb of config.fallbacks) {
        chain.push({ family: fb.family, cssStack: fb.cssStack, heuristic: fb.heuristic, embedded: false });
      }
    } else {
      // 未注册的族名：直接当作系统 CSS 栈使用
      chain.push({ family, cssStack: [family], embedded: false });
    }

    for (const entry of chain) {
      if (entry.embedded) {
        const face = this.pickEmbeddedFace(entry.family, weight, style);
        if (face) {
          if (face.coverage === null) {
            // WOFF2 等无法静态解析：交给运行时探测
            if (this.runtimeProbe(entry.family, cp, weight, style)) {
              return { font: this.toResolved(entry.family, [entry.family], weight, style), embedded: true };
            }
          } else if (face.coverage.has(cp)) {
            return { font: this.toResolved(entry.family, [entry.family], weight, style), embedded: true };
          }
          continue;
        }
      }
      // 系统字体：启发式 + 运行时探测双确认
      if (this.heuristicAllows(entry.heuristic, cp) && this.runtimeProbe(entry.cssStack[0] ?? entry.family, cp, weight, style)) {
        return { font: this.toResolved(entry.family, entry.cssStack, weight, style), embedded: false };
      }
    }
    return null;
  }

  private pickEmbeddedFace(family: string, weight: number, style: 'normal' | 'italic'): LoadedFace | undefined {
    const exact = this.faces.find((f) => f.family === family && f.weight === weight && f.style === style);
    if (exact) return exact;
    const sameStyle = this.faces.filter((f) => f.family === family && f.style === style);
    if (sameStyle.length) return sameStyle.sort((a, b) => Math.abs(a.weight - weight) - Math.abs(b.weight - weight))[0];
    return this.faces.find((f) => f.family === family);
  }

  private heuristicAllows(rules: UnicodeRangeRule[] | undefined, cp: number): boolean {
    if (!rules) return true; // 无规则声明 = 不限制
    // 先取默认区块规则（按族名关键词匹配），再与显式规则合并
    for (const rule of rules) {
      const inRange = rule.ranges.some(([lo, hi]) => cp >= lo && cp <= hi);
      if (inRange) return rule.covers;
    }
    return true;
  }

  private runtimeProbe(family: string, cp: number, weight: number, style: 'normal' | 'italic'): boolean {
    const key = `${family}|${cp}|${weight}|${style}`;
    const cached = this.probeCache.get(key);
    if (cached !== undefined) return cached;
    let ok = true;
    try {
      const fontCss = `${style} ${weight} 16px "${family}"`;
      const ch = String.fromCodePoint(cp);
      const fss = getFontFaceSet();
      if (fss && typeof fss.check === 'function') {
        // check 会受系统兜底影响：用两个不可能存在的族名做基线对照
        ok = fss.check(fontCss, ch);
      }
    } catch {
      ok = true;
    }
    this.probeCache.set(key, ok);
    return ok;
  }

  private toResolved(family: string, cssStack: string[], weight: number, style: 'normal' | 'italic'): ResolvedFont {
    const stack = [family, ...cssStack.filter((s) => s !== family)].map((s) => `"${s}"`).join(', ');
    return { css: `${style} ${weight} {size}px ${stack}`, family, weight, style };
  }
}

export interface GraphicsLike {
  measureText(text: string): { width: number };
  font: string;
}

type FontFaceTarget = typeof globalThis;

function getFontFaceSet(): FontFaceSet | undefined {
  return (globalThis as { document?: { fonts?: FontFaceSet }; fonts?: FontFaceSet }).document?.fonts
    ?? (globalThis as { fonts?: FontFaceSet }).fonts;
}

function addToFontFaceSet(target: FontFaceTarget, face: FontFace): void {
  const doc = (target as { document?: { fonts?: FontFaceSet } }).document;
  if (doc?.fonts) {
    doc.fonts.add(face);
  } else {
    const workerFonts = (target as { fonts?: FontFaceSet }).fonts;
    workerFonts?.add(face);
  }
}

/** 一个字素簇及其解析结果 */
export interface MeasuredCluster {
  cluster: string;
  codePoints: number[];
  font: ResolvedFont | null; // null = 整条链缺字
  width: number;
  isIcon: boolean;
  iconW?: number;
  iconH?: number;
  breakableBefore: boolean;
}

export interface MeasureOptions {
  fontFamily: string;
  fontSize: number;
  bold?: boolean;
  italic?: boolean;
  letterSpacing?: number;
  /** U+FFFC 位置上的图标尺寸（按出现顺序消费） */
  icons?: { name: string; w: number; h: number }[];
}

/**
 * 测量一段纯文本（富文本已展开、图标为 U+FFFC）。
 * 连续同字体簇合并测量以保留 shaping；返回逐簇宽度与缺字码点。
 */
export function measureText(
  registry: FontRegistry,
  g: GraphicsLike,
  text: string,
  opts: MeasureOptions,
): { clusters: MeasuredCluster[]; width: number; missing: number[] } {
  const clusters = graphemeClusters(text);
  const missing: number[] = [];
  const iconQueue = [...(opts.icons ?? [])];
  const out: MeasuredCluster[] = [];
  const letterSpacing = opts.letterSpacing ?? 0;

  // 先逐簇解析字体
  for (let i = 0; i < clusters.length; i += 1) {
    const { text: cluster } = clusters[i];
    const codePoints = Array.from(cluster).map((c) => c.codePointAt(0)!);
    const firstCp = codePoints[0];

    if (firstCp === 0xfffc) {
      const icon = iconQueue.shift();
      out.push({
        cluster,
        codePoints,
        font: null,
        width: (icon?.w ?? 16) + letterSpacing,
        isIcon: true,
        iconW: icon?.w ?? 16,
        iconH: icon?.h ?? 16,
        breakableBefore: false,
      });
      continue;
    }

    // 组合记号/ZWJ 跟随前一个簇的字体
    let resolved: { font: ResolvedFont; embedded: boolean } | null = null;
    if ((isCombiningMark(firstCp) || isZeroWidthJoiner(firstCp)) && out.length > 0 && out[i - 1].font) {
      resolved = { font: out[i - 1].font!, embedded: false };
    } else {
      resolved = registry.resolveCodePoint(firstCp, opts.fontFamily, !!opts.bold, !!opts.italic);
    }
    if (!resolved) {
      for (const cp of codePoints) {
        if (!isCombiningMark(cp) && !isZeroWidthJoiner(cp) && cp !== 0x200b) missing.push(cp);
      }
    }
    out.push({
      cluster,
      codePoints,
      font: resolved?.font ?? null,
      width: 0,
      isIcon: false,
      breakableBefore: false,
    });
  }

  // 合并相邻同字体簇做 measureText，保留 kerning/ligature/shaping
  let width = 0;
  let i = 0;
  while (i < out.length) {
    const c = out[i];
    if (c.isIcon) {
      width += c.width;
      i++;
      continue;
    }
    let j = i;
    while (
      j + 1 < out.length &&
      !out[j + 1].isIcon &&
      fontKey(out[j + 1].font) === fontKey(c.font)
    ) {
      j++;
    }
    const groupText = out
      .slice(i, j + 1)
      .map((x) => x.cluster)
      .join('');
    const groupLen = [...groupText].length;
    let groupWidth = 0;
    if (c.font) {
      g.font = c.font.css.replace('{size}', String(opts.fontSize));
      groupWidth = g.measureText(groupText).width;
    } else {
      // 缺字：按 .notdef 方块估算，每码点 0.6em
      groupWidth = groupLen * opts.fontSize * 0.6;
    }
    // 字间距按簇摊分（最后一簇不加，与 CSS letter-spacing 行为近似）
    let allocated = 0;
    const memberCount = j - i + 1;
    for (let k = i; k <= j; k++) {
      const share = k < j ? groupWidth / memberCount + letterSpacing : groupWidth - allocated;
      out[k].width = Math.max(0, share);
      allocated += out[k].width;
    }
    width += groupWidth + (memberCount - 1) * letterSpacing;
    i = j + 1;
  }

  return { clusters: out, width, missing: [...new Set(missing)] };
}

function fontKey(f: ResolvedFont | null): string {
  return f ? f.css : '__missing__';
}

/** 内置默认字体配置（系统字体栈，零文件即可演示） */
export function createDefaultFontConfig(): FontConfig[] {
  const make = (family: string, stack: string[], fallbackKeys: (keyof typeof DEFAULT_HEURISTICS)[]): FontConfig => ({
    family,
    cssStack: stack,
    embedded: [],
    fallbacks: fallbackKeys.map((key) => ({
      family: `${family}-${key}-fallback`,
      cssStack: SYSTEM_STACKS[key],
      heuristic: DEFAULT_HEURISTICS[key],
    })),
  });
  return [
    make('GameUI', ['Segoe UI', 'Arial', 'sans-serif'], ['arabic', 'thai', 'devanagari', 'cjk']),
    make('GameTitle', ['Segoe UI', 'Arial', 'sans-serif'], ['arabic', 'thai', 'devanagari', 'cjk']),
  ];
}

const SYSTEM_STACKS: Record<keyof typeof DEFAULT_HEURISTICS, string[]> = {
  arabic: ['Segoe UI', 'Tahoma', 'Arial', 'sans-serif'],
  thai: ['Leelawadee UI', 'Tahoma', 'sans-serif'],
  devanagari: ['Nirmala UI', 'Mangal', 'sans-serif'],
  cjk: ['Microsoft YaHei', 'Segoe UI', 'sans-serif'],
};
