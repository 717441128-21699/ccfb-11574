import type { TextRun } from './types';

/**
 * 测量器:单例离屏 canvas,font 字符串级缓存。
 * 浏览器对 font stack 做逐字形回退,且 measureText 对泰语/印地语/阿语
 * 走完整 shaping(HarfBuzz),所以测出来的就是游戏引擎(用同一字体时)的宽度。
 */
export class Measurer {
  private ctx: CanvasRenderingContext2D;
  private cache = new Map<string, number>();
  /** 逻辑 family 已在 FontManager.stackCSS 里展开,这里只收最终 family 列表 */
  rtl = false;

  constructor() {
    const c = document.createElement('canvas');
    this.ctx = c.getContext('2d')!;
  }

  fontString(size: number, stackCSS: string, bold?: boolean): string {
    return `${bold ? 'bold ' : ''}${size}px ${stackCSS}`;
  }

  measureText(text: string, size: number, stackCSS: string, bold?: boolean): number {
    const font = this.fontString(size, stackCSS, bold);
    const key = font + '​' + text;
    let w = this.cache.get(key);
    if (w === undefined) {
      if (this.ctx.font !== font) this.ctx.font = font;
      w = this.ctx.measureText(text).width;
      if (this.cache.size > 200_000) this.cache.clear(); // 防无限增长
      this.cache.set(key, w);
    }
    return w;
  }

  /** 单个 run 的宽度;图标按 iconRatio * 字号 占位 */
  measureRun(run: TextRun, baseSize: number, stackCSS: string, iconRatio: number): number {
    const size = run.size ?? baseSize;
    if (run.kind === 'icon') return size * iconRatio;
    return this.measureText(run.text, size, stackCSS, run.bold);
  }
}
