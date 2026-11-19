/**
 * Canvas 渲染器：把布局文档与排版结果画到 Canvas 上，
 * 并按检测结果叠加问题高亮框。
 *
 * 绘制策略：
 *  - 控件按布局顺序绘制（容器 → 面板 → 图片 → 按钮 → 文本）；
 *  - 文本逐 LaidRun 调用 fillText，RTL run 设置 ctx.direction='rtl'，
 *    复杂文字 shaping（泰文/天城文/阿拉伯文）交给平台文本栈；
 *  - 图标占位画虚线框 + 图标名（工具内无真实美术资源）；
 *  - 问题层：红框/黄框/紫框分别对应 error/warning/info，带行号标签。
 */
import type { Issue, LayoutDocument, LaidRun, TextLayoutResult, Widget } from '../types';

export interface RenderOptions {
  dpr?: number;
  showIssues?: boolean;
  highlightIssueId?: string;
  issues?: Issue[];
  selectedWidgetId?: string | null;
  /** 显式指定可用容器宽高（对比视图等父容器高度由内容决定的场景） */
  containerWidth?: number;
  containerHeight?: number;
}

const SEVERITY_COLORS: Record<Issue['severity'], string> = {
  error: '#ff3b30',
  warning: '#ff9500',
  info: '#5ac8fa',
};

const TYPE_COLORS: Partial<Record<Issue['type'], string>> = {
  overflow: '#ff3b30',
  truncation: '#ff2d55',
  overlap: '#af52de',
  'missing-glyph': '#ff9500',
  shrink: '#ffcc00',
};

export class ScreenRenderer {
  private ctx: CanvasRenderingContext2D;
  private canvas: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D 不可用');
    this.ctx = ctx;
  }

  get targetCanvas(): HTMLCanvasElement {
    return this.canvas;
  }

  render(
    layout: LayoutDocument,
    textLayouts: TextLayoutResult[],
    opts: RenderOptions = {},
  ): void {
    const dpr = opts.dpr ?? Math.min(window.devicePixelRatio || 1, 2);
    const parent = this.canvas.parentElement;
    const availW = opts.containerWidth ?? parent?.clientWidth ?? layout.designWidth;
    const availH = opts.containerHeight ?? parent?.clientHeight ?? 600;
    const scale = Math.min(
      availW / layout.designWidth,
      (availH || 600) / layout.designHeight,
      1.5,
    );
    const cssW = layout.designWidth * scale;
    const cssH = layout.designHeight * scale;
    this.canvas.style.width = `${cssW}px`;
    this.canvas.style.height = `${cssH}px`;
    this.canvas.width = Math.round(cssW * dpr);
    this.canvas.height = Math.round(cssH * dpr);

    const ctx = this.ctx;
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
    ctx.clearRect(0, 0, layout.designWidth, layout.designHeight);

    // 背景
    ctx.fillStyle = '#1c1c22';
    ctx.fillRect(0, 0, layout.designWidth, layout.designHeight);

    const tlMap = new Map(textLayouts.map((t) => [t.widgetId, t]));
    this.drawWidgets(layout.widgets, tlMap);

    if (opts.showIssues !== false && opts.issues?.length) {
      this.drawIssues(opts.issues, opts.highlightIssueId);
    }
    if (opts.selectedWidgetId) {
      const w = findWidget(layout.widgets, opts.selectedWidgetId);
      if (w) this.drawSelection(w.rect);
    }
  }

  private drawWidgets(widgets: Widget[], tlMap: Map<string, TextLayoutResult>): void {
    for (const w of widgets) {
      this.drawWidgetFrame(w);
      const tl = tlMap.get(w.id);
      if (tl) this.drawTextLayout(tl);
      if (w.children?.length) this.drawWidgets(w.children, tlMap);
    }
  }

  private drawWidgetFrame(w: Widget): void {
    const ctx = this.ctx;
    const { x, y, w: ww, h } = w.rect;
    if (w.type === 'button') {
      ctx.fillStyle = '#2f6fed';
      this.roundRect(x, y, ww, h, 8);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.18)';
      ctx.lineWidth = 1;
      ctx.stroke();
    } else if (w.type === 'panel') {
      ctx.fillStyle = '#26262e';
      this.roundRect(x, y, ww, h, 6);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.stroke();
    } else if (w.type === 'image') {
      ctx.fillStyle = '#3a3a44';
      this.roundRect(x, y, ww, h, 4);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.15)';
      ctx.setLineDash([4, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('[img]', x + ww / 2, y + h / 2);
    } else if (w.type === 'container') {
      ctx.strokeStyle = 'rgba(255,255,255,0.06)';
      ctx.strokeRect(x, y, ww, h);
    }
  }

  private drawTextLayout(tl: TextLayoutResult): void {
    const ctx = this.ctx;
    for (const line of tl.lines) {
      for (const run of line.runs) {
        if (run.icon) {
          this.drawIcon(run);
          continue;
        }
        ctx.save();
        ctx.font = run.font;
        ctx.direction = line.dir;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = run.color ?? '#f2f2f7';
        const baseline = run.y + run.height * 0.78;
        ctx.fillText(run.text, run.x, baseline);
        ctx.restore();
      }
    }
  }

  private drawIcon(run: LaidRun): void {
    const ctx = this.ctx;
    const icon = run.icon!;
    const x = run.x;
    const y = run.y + (run.height - icon.h) / 2;
    ctx.save();
    ctx.fillStyle = 'rgba(255,204,0,0.25)';
    ctx.strokeStyle = '#ffcc00';
    ctx.setLineDash([3, 3]);
    ctx.fillRect(x, y, icon.w, icon.h);
    ctx.strokeRect(x, y, icon.w, icon.h);
    ctx.setLineDash([]);
    ctx.fillStyle = '#ffcc00';
    ctx.font = '9px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.direction = 'ltr';
    ctx.fillText(icon.name.slice(0, 4), x + icon.w / 2, y + icon.h / 2);
    ctx.restore();
  }

  private drawIssues(issues: Issue[], highlightId?: string): void {
    const ctx = this.ctx;
    for (const iss of issues) {
      const color = TYPE_COLORS[iss.type] ?? SEVERITY_COLORS[iss.severity];
      const isHi = highlightId === issueKey(iss);
      ctx.save();
      ctx.lineWidth = isHi ? 3 : 1.5;
      ctx.strokeStyle = color;
      ctx.globalAlpha = isHi ? 1 : 0.85;
      ctx.setLineDash(isHi ? [] : [6, 4]);
      ctx.strokeRect(iss.rect.x - 2, iss.rect.y - 2, iss.rect.w + 4, iss.rect.h + 4);
      ctx.setLineDash([]);
      if (isHi || iss.severity === 'error') {
        const label = iss.sourceRow > 0 ? `行${iss.sourceRow}` : iss.widgetId;
        ctx.font = 'bold 11px sans-serif';
        const tw = ctx.measureText(label).width + 10;
        ctx.fillStyle = color;
        ctx.fillRect(iss.rect.x - 2, Math.max(0, iss.rect.y - 20), tw, 16);
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.direction = 'ltr';
        ctx.fillText(label, iss.rect.x + 3, Math.max(8, iss.rect.y - 12));
      }
      ctx.restore();
    }
  }

  private drawSelection(rect: Widget['rect']): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = '#0a84ff';
    ctx.lineWidth = 2;
    ctx.strokeRect(rect.x - 3, rect.y - 3, rect.w + 6, rect.h + 6);
    ctx.restore();
  }

  private roundRect(x: number, y: number, w: number, h: number, r: number): void {
    const ctx = this.ctx;
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }
}

export function issueKey(iss: Issue): string {
  return `${iss.layoutId}|${iss.lang}|${iss.widgetId}|${iss.type}|${iss.sourceRow}`;
}

function findWidget(widgets: Widget[], id: string): Widget | null {
  for (const w of widgets) {
    if (w.id === id) return w;
    if (w.children) {
      const found = findWidget(w.children, id);
      if (found) return found;
    }
  }
  return null;
}
