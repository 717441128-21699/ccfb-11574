import type { Issue, ScreenReport, WidgetDef } from './types';
import type { FontManager } from './fonts';

export interface RenderOpts {
  fonts: FontManager;
  leading: number;
  iconRatio: number;
  showBoxes: boolean;
  /** 只高亮这些 issue 对应的 widget(可选,用于点击联动) */
  focusWidgetId?: string;
}

const ISSUE_COLORS: Record<string, string> = {
  'overflow-x': '#ff4d4f',
  'overflow-y': '#ff7a45',
  overlap: '#f759ab',
  'missing-glyph': '#faad14',
  'missing-key': '#9254de',
};

/** 把一个界面一个语言画到 canvas 上,问题控件标红 */
export function renderScreen(
  canvas: HTMLCanvasElement,
  report: ScreenReport,
  issues: Issue[],
  o: RenderOpts,
): void {
  const { screen, lang } = report;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = screen.width * dpr;
  canvas.height = screen.height * dpr;
  canvas.style.aspectRatio = `${screen.width} / ${screen.height}`;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(dpr, dpr);

  // 背景
  ctx.fillStyle = '#1f2430';
  ctx.fillRect(0, 0, screen.width, screen.height);

  const issueWidgets = new Map<string, Issue[]>();
  for (const iss of issues) {
    const arr = issueWidgets.get(iss.widgetId) ?? [];
    arr.push(iss);
    issueWidgets.set(iss.widgetId, arr);
  }

  const cfg = o.fonts.configFor(lang);
  ctx.direction = cfg.rtl ? 'rtl' : 'ltr';

  for (const layout of report.layouts) {
    const w: WidgetDef = layout.widget;

    // 控件底
    if (w.type === 'panel' || w.type === 'image') {
      ctx.fillStyle = w.type === 'panel' ? '#2c3345' : '#39415a';
      ctx.fillRect(w.x, w.y, w.w, w.h);
    } else if (w.type === 'button') {
      ctx.fillStyle = '#3a5a8c';
      ctx.beginPath();
      ctx.roundRect(w.x, w.y, w.w, w.h, 4);
      ctx.fill();
    }

    if (o.showBoxes) {
      ctx.strokeStyle = 'rgba(255,255,255,0.14)';
      ctx.lineWidth = 1;
      ctx.strokeRect(w.x + 0.5, w.y + 0.5, w.w - 1, w.h - 1);
    }

    // 文本
    if (layout.result && layout.textRect) {
      const pad = w.padding ?? 0;
      const availW = w.w - pad * 2;
      const size = w.fontSize ?? 16;
      const align = w.align ?? (cfg.rtl ? 'right' : 'left');
      const valign = w.valign ?? 'middle';
      const nLines = layout.result.lines.length;
      const lineH = nLines ? layout.result.contentH / nLines : size * o.leading;

      let startX = w.x + pad;
      if (align === 'center') startX = w.x + pad + (availW - layout.result.contentW) / 2;
      else if (align === 'right') startX = w.x + pad + (availW - layout.result.contentW);

      let startY = w.y + pad;
      const availH = w.h - pad * 2;
      if (valign === 'middle') startY = w.y + pad + (availH - layout.result.contentH) / 2;
      else if (valign === 'bottom') startY = w.y + pad + (availH - layout.result.contentH);

      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';
      layout.result.lines.forEach((line, li) => {
        const cy = startY + li * lineH + lineH / 2;
        // 行内 x 是相对行左缘的;行本身在内容区里按对齐偏移
        const lineOffsetX = align === 'center'
          ? startX + (layout.result!.contentW - line.width) / 2
          : align === 'right'
            ? startX + (layout.result!.contentW - line.width)
            : startX;
        for (const run of line.runs) {
          const rx = lineOffsetX + run.x;
          const rsize = run.size ?? size;
          if (run.kind === 'icon') {
            const iw = rsize * o.iconRatio;
            ctx.fillStyle = '#d4a017';
            ctx.fillRect(rx, cy - iw / 2, iw, iw);
            ctx.strokeStyle = '#8a6d0b';
            ctx.strokeRect(rx + 0.5, cy - iw / 2 + 0.5, iw - 1, iw - 1);
          } else {
            ctx.font = `${run.bold ? 'bold ' : ''}${rsize}px ${o.fonts.stackCSS(lang, w.fontFamily)}`;
            ctx.fillStyle = run.color ?? '#e8eaf0';
            ctx.fillText(run.text, rx, cy);
          }
        }
      });
    }

    // 问题高亮
    const wIssues = issueWidgets.get(w.id);
    if (wIssues?.length) {
      const color = ISSUE_COLORS[wIssues[0].type] ?? '#ff4d4f';
      ctx.lineWidth = o.focusWidgetId === w.id ? 3 : 2;
      ctx.strokeStyle = color;
      ctx.strokeRect(w.x - 1, w.y - 1, w.w + 2, w.h + 2);
      ctx.fillStyle = color + '22';
      ctx.fillRect(w.x, w.y, w.w, w.h);
      // 文本实际范围(溢出可视化)
      if (layout.textRect && wIssues.some((i) => i.type === 'overlap' || i.type === 'overflow-x')) {
        ctx.setLineDash([4, 3]);
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.strokeRect(layout.textRect.x, layout.textRect.y, layout.textRect.w, layout.textRect.h);
        ctx.setLineDash([]);
      }
    }
  }
}
