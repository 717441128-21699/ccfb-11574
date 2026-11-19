/// <reference lib="webworker" />
/**
 * 检测 Worker：每个 worker 持有独立的 FontRegistry 与离屏测量上下文，
 * 接收 (layout, table, lang) 任务并回传 ScreenResult。
 */
import type { ScreenResult, WorkerRequest, WorkerResponse } from '../types';
import { FontRegistry } from '../text/fontResolver';
import { runScreen } from '../engine/runner';

const registry = new FontRegistry();
let measureCtx: OffscreenCanvasRenderingContext2D | null = null;

function ensureContext(): OffscreenCanvasRenderingContext2D {
  if (!measureCtx) {
    const canvas = new OffscreenCanvas(64, 64);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Worker 内无法创建 2D 上下文');
    measureCtx = ctx;
  }
  return measureCtx;
}

const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = async (ev: MessageEvent<WorkerRequest>) => {
  const msg = ev.data;
  try {
    if (msg.kind === 'init') {
      await registry.hydrate(msg.fonts, ctx as unknown as typeof globalThis);
      registry.bindGraphics(ensureContext());
      const ready: WorkerResponse = { kind: 'ready' };
      ctx.postMessage(ready);
      return;
    }
    if (msg.kind === 'run') {
      const result: ScreenResult = runScreen(msg.layout, msg.table, {
        registry,
        g: ensureContext(),
        worstCase: msg.worstCase,
      });
      const response: WorkerResponse = { kind: 'result', id: msg.id, result };
      ctx.postMessage(response);
      return;
    }
    if (msg.kind === 'cancel') return;
  } catch (err) {
    const response: WorkerResponse = {
      kind: 'error',
      id: (msg as { id?: number }).id ?? -1,
      message: err instanceof Error ? err.message : String(err),
    };
    ctx.postMessage(response);
  }
};
