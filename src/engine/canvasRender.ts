/**
 * 排版结果渲染：把 TextLayoutResult 画到 Canvas 上。
 * 渲染与测量使用同一套 cssFontString；run 已在排版层排成视觉顺序，
 * 绘制时固定 dir=ltr 只做定位，shaping 在测量层已按 run 方向完成。
 * 图标用占位块表示（真实项目可替换为游戏图集贴图）。
 */
import { cssFontString } from '../core/measurer';
import type { Issue, LanguageDef, Rect, TextLayoutResult } from '../core/types';

export interface RenderOptions {
  scale: number;
  showControlFrames: boolean;
  highlightIssueId?: string;
  issues?: Issue[];
  /** 屏幕背景控件框（所有控件，含非文本） */
  allControlRects?: { id: string; rect: Rect }[];
}

export function renderLayout(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  layout: TextLayoutResult,
  language: LanguageDef,
  options: RenderOptions,
): void {
  const { scale } = options;
  ctx.save();
  ctx.scale(scale, scale);

  const ctrl = layout.controlRect;
  const frame = layout.textFrame;

  if (options.showControlFrames && options.allControlRects) {
    for (const rc of options.allControlRects) {
      ctx.strokeStyle = rc.id === layout.controlId ? 'rgba(120,255,170,0.6)' : 'rgba(120,160,255,0.35)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 3]);
      strokeRect(ctx, rc.rect);
    }
    ctx.setLineDash([]);
    strokeRect(ctx, { x: ctrl.x + frame.x, y: ctrl.y + frame.y, width: frame.width, height: frame.height });
  }

  for (const line of layout.lines) {
    for (const run of line.runs) {
      const seg = run.segment;
      const x = ctrl.x + frame.x + run.x;
      const y = ctrl.y + frame.y + line.y + (line.height - seg.fontSize) / 2;

      if (seg.kind === 'icon') {
        drawIconPlaceholder(ctx, x, ctrl.y + frame.y + line.y, run.width, line.height, seg.content);
        continue;
      }

      const familyStack = [seg.fontFamily, ...language.fontStack.filter((f) => f !== seg.fontFamily)];
      ctx.font = cssFontString(familyStack, seg.fontSize, seg.fontWeight, seg.italic);
      ctx.direction = 'ltr';
      ctx.fillStyle = seg.color;
      ctx.textBaseline = 'top';
      ctx.fillText(run.text, x, y);
    }
  }

  if (options.issues) {
    for (const issue of options.issues) {
      if (issue.controlId !== layout.controlId || issue.language !== layout.language) continue;
      const active = issue.id === options.highlightIssueId;
      ctx.strokeStyle = active ? '#ff5577' : 'rgba(255,80,100,0.85)';
      ctx.lineWidth = active ? 3 : 1.5;
      ctx.setLineDash(active ? [] : [6, 4]);
      strokeRect(ctx, issue.bounds);
      if (active) {
        ctx.fillStyle = 'rgba(255,80,100,0.15)';
        ctx.fillRect(issue.bounds.x, issue.bounds.y, issue.bounds.width, issue.bounds.height);
      }
    }
    ctx.setLineDash([]);
  }

  ctx.restore();
}

/** 渲染整屏背景（画布底色 + 控件辅助框），在各语言并排视图里每格调用。 */
export function renderScreenBackground(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  size: { width: number; height: number },
  scale: number,
  rects: { id: string; rect: Rect }[],
): void {
  ctx.save();
  ctx.scale(scale, scale);
  ctx.fillStyle = '#1b2030';
  ctx.fillRect(0, 0, size.width, size.height);
  for (const rc of rects) {
    ctx.strokeStyle = 'rgba(120,160,255,0.3)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);
    strokeRect(ctx, rc.rect);
  }
  ctx.setLineDash([]);
  ctx.restore();
}

function drawIconPlaceholder(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  label: string,
): void {
  ctx.save();
  ctx.fillStyle = 'rgba(255,200,80,0.25)';
  ctx.strokeStyle = 'rgba(255,200,80,0.9)';
  ctx.lineWidth = 1;
  ctx.fillRect(x, y + h * 0.15, w, h * 0.7);
  ctx.strokeRect(x, y + h * 0.15, w, h * 0.7);
  ctx.fillStyle = '#ffcc66';
  ctx.font = '10px sans-serif';
  ctx.textBaseline = 'top';
  ctx.direction = 'ltr';
  ctx.fillText(label, x + 2, y + h * 0.15 + 2);
  ctx.restore();
}

function strokeRect(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, r: Rect): void {
  ctx.strokeRect(r.x, r.y, r.width, r.height);
}
