/**
 * 多语言并排 Canvas 视图：
 * 每个选中语言一格，按设计分辨率等比缩放绘制，
 * 问题红框与高亮跟随 store 状态。
 */
import { renderLayout, renderScreenBackground } from '../engine/canvasRender';
import { resolveScreen } from '../core/layoutResolver';
import { store } from './store';
import type { AppState } from './store';
import type { LanguageDef, ScreenDef, TextLayoutResult } from '../core/types';

const CELL_SCALE = 0.62; // 设计分辨率到展示画布的缩放

export class CanvasGridView {
  private host: HTMLElement;

  constructor(host: HTMLElement) {
    this.host = host;
  }

  render(state: AppState): void {
    const screen = state.project.screens.find((s) => s.id === state.selectedScreenId);
    if (!screen) {
      this.host.innerHTML = '<div class="empty-hint">没有可选界面，请先导入布局文件。</div>';
      return;
    }

    const layouts = store.layoutsForScreen(screen.id);
    const languages = state.project.languages.filter((l) => state.selectedLanguages.includes(l.code));

    if (layouts.length === 0) {
      this.host.innerHTML = `
        <div class="empty-hint">
          <p><strong>${screen.name}</strong>（${screen.canvasSize.width}×${screen.canvasSize.height}）</p>
          <p>点击顶部「开始批量检测」生成八语言并排排版。</p>
          <p style="opacity:.7">检测项：超框 / 截断 / 压盖 / 缺字 / 字体回退</p>
        </div>`;
      return;
    }

    const resolved = resolveScreen(screen);
    const allRects = [...resolved.values()].map((rc) => ({ id: rc.control.id, rect: rc.absoluteRect }));
    const issues = state.report?.issues ?? [];

    const grid = document.createElement('div');
    grid.className = 'lang-grid';

    for (const lang of languages) {
      const cell = document.createElement('div');
      cell.className = 'lang-cell' + (lang.forceDirection === 'rtl' ? ' rtl' : '');

      const header = document.createElement('div');
      header.className = 'lang-cell-header';
      const langLayouts = layouts.filter((l) => l.language === lang.code);
      const langIssues = issues.filter((i) => i.language === lang.code && i.screenId === screen.id);
      const errCount = langIssues.filter((i) => i.severity === 'error').length;
      header.innerHTML = `
        <span>${lang.label}</span>
        <code>${lang.code}</code>
        ${lang.forceDirection === 'rtl' ? '<span class="rtl-tag">RTL</span>' : ''}
        <span class="badge ${errCount ? 'error' : ''}">${langIssues.length ? `${langIssues.length} 问题` : '通过'}</span>`;
      cell.appendChild(header);

      const wrap = document.createElement('div');
      wrap.className = 'canvas-wrap';
      const canvas = document.createElement('canvas');
      canvas.className = 'screen-canvas';
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const cssW = Math.round(screen.canvasSize.width * CELL_SCALE);
      const cssH = Math.round(screen.canvasSize.height * CELL_SCALE);
      canvas.style.width = `${cssW}px`;
      canvas.style.height = `${cssH}px`;
      canvas.width = Math.round(screen.canvasSize.width * CELL_SCALE * dpr);
      canvas.height = Math.round(screen.canvasSize.height * CELL_SCALE * dpr);
      const ctx = canvas.getContext('2d')!;
      ctx.scale(dpr, dpr);

      renderScreenBackground(ctx, screen.canvasSize, CELL_SCALE, allRects);
      for (const layout of langLayouts) {
        renderLayout(ctx, layout, lang, {
          scale: CELL_SCALE,
          showControlFrames: state.showControlFrames,
          highlightIssueId: state.highlightIssueId,
          issues,
          allControlRects: allRects,
        });
      }
      wrap.appendChild(canvas);
      cell.appendChild(wrap);
      grid.appendChild(cell);
    }

    this.host.innerHTML = '';
    this.host.appendChild(grid);
  }
}

export function findLayoutFor(
  layouts: TextLayoutResult[],
  screen: ScreenDef,
  lang: LanguageDef,
  controlId: string,
): TextLayoutResult | undefined {
  void screen;
  return layouts.find((l) => l.language === lang.code && l.controlId === controlId);
}
