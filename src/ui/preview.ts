/**
 * 单屏预览：对选中的界面与语言实时跑一次排版并渲染到 Canvas。
 * 不经过 Worker（单屏延迟优先），复用主线程 FontRegistry。
 */
import type { LangCode, LayoutDocument, ScreenResult } from '../types';
import { runScreen, createMeasureContext } from '../engine/runner';
import { ScreenRenderer } from '../render/ScreenRenderer';
import { store } from '../store';

let renderer: ScreenRenderer | null = null;
let measureCtx: ReturnType<typeof createMeasureContext> | null = null;
let current: { layoutId: string; lang: LangCode; result: ScreenResult } | null = null;

export function getCurrentPreview(): typeof current {
  return current;
}

export function renderPreview(
  canvas: HTMLCanvasElement,
  layout: LayoutDocument,
  lang: LangCode,
): ScreenResult | null {
  const { tables, registry, worstCase } = store.getState();
  const table = tables.get(lang);
  if (!table) return null;
  if (!measureCtx) measureCtx = createMeasureContext();
  registry.bindGraphics(measureCtx);

  const result = runScreen(layout, table, { registry, g: measureCtx, worstCase });
  if (!renderer || renderer.targetCanvas !== canvas) {
    renderer = new ScreenRenderer(canvas);
  }
  const selected = store.getState().selectedIssue;
  renderer.render(layout, result.textLayouts, {
    issues: result.issues,
    highlightIssueId: selected ? `${selected.layoutId}|${selected.lang}|${selected.widgetId}|${selected.type}|${selected.sourceRow}` : undefined,
    selectedWidgetId: selected?.widgetId,
  });
  current = { layoutId: layout.id, lang, result };
  return result;
}
