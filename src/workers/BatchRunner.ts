/**
 * Worker 池 + 批量调度。
 *
 * 性能策略（3000 界面 × 8 语言 = 24000 任务，目标 < 5 分钟）：
 *  - worker 数 = min(navigator.hardwareConcurrency, 8)；
 *  - 每个任务只传当前界面与当前语言表（结构化克隆，避免大表反复全量复制
 *    的做法：同语言的表在一轮内复用引用，由浏览器内部缓存克隆）；
 *  - 主线程提供降级路径：worker 不可用时在主线程串行执行；
 *  - 进度按完成任务数回调，可中途取消。
 */
import type {
  BatchProgress,
  BatchReport,
  LayoutDocument,
  ScreenResult,
  SerializedFontConfig,
  TextTable,
  WorstCaseVars,
} from '../types';
import { runScreen, createMeasureContext } from '../engine/runner';
import { FontRegistry } from '../text/fontResolver';
import { summarize } from '../engine/detector';

export interface BatchInput {
  layouts: LayoutDocument[];
  tablesByLang: Map<string, TextTable>;
  fonts: SerializedFontConfig[];
  worstCase?: WorstCaseVars;
  languages: string[];
}

export class BatchRunner {
  private workers: Worker[] = [];
  private cancelled = false;
  private registry: FontRegistry | null = null;
  private fallbackG: ReturnType<typeof createMeasureContext> | null = null;

  private createWorker(): Worker {
    return new Worker(new URL('./detect.worker.ts', import.meta.url), { type: 'module' });
  }

  async run(input: BatchInput, onProgress?: (p: BatchProgress) => void): Promise<BatchReport> {
    const start = performance.now();
    const total = input.layouts.length * input.languages.length;
    const tasks: { layout: LayoutDocument; table: TextTable; lang: string }[] = [];
    for (const layout of input.layouts) {
      for (const lang of input.languages) {
        const table = input.tablesByLang.get(lang);
        if (table) tasks.push({ layout, table, lang });
      }
    }

    let results: ScreenResult[];
    const workerSupported = typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined';
    if (workerSupported) {
      results = await this.runWithWorkers(tasks, input, total, onProgress, start);
    } else {
      results = await this.runOnMainThread(tasks, input, total, onProgress, start);
    }
    if (this.cancelled) results = results.filter(Boolean);

    const summary = summarize(results);
    return {
      results,
      totalIssues: summary.totalIssues,
      byType: summary.byType,
      byLang: summary.byLang,
      durationMs: performance.now() - start,
      screens: input.layouts.length,
      languages: input.languages.length,
    };
  }

  cancel(): void {
    this.cancelled = true;
  }

  dispose(): void {
    for (const w of this.workers) w.terminate();
    this.workers = [];
  }

  private async runWithWorkers(
    tasks: BatchTask[],
    input: BatchInput,
    total: number,
    onProgress: ((p: BatchProgress) => void) | undefined,
    start: number,
  ): Promise<ScreenResult[]> {
    const workerCount = Math.min(navigator.hardwareConcurrency || 4, 8);
    this.workers = Array.from({ length: workerCount }, () => this.createWorker());
    await Promise.all(
      this.workers.map(
        (w) =>
          new Promise<void>((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('Worker 初始化超时')), 15000);
            w.onmessage = (ev: MessageEvent<{ kind: string }>) => {
              if (ev.data.kind === 'ready') {
                clearTimeout(timer);
                resolve();
              }
            };
            w.onerror = (e) => {
              clearTimeout(timer);
              reject(e);
            };
            w.postMessage({ kind: 'init', fonts: input.fonts, worstCase: input.worstCase });
          }),
      ),
    );

    const results: ScreenResult[] = new Array(tasks.length);
    let next = 0;
    let done = 0;
    let issuesFound = 0;
    let inFlight = 0;

    await new Promise<void>((resolve, reject) => {
      const assign = (worker: Worker) => {
        if (this.cancelled) {
          if (inFlight === 0) resolve();
          return;
        }
        if (next >= tasks.length) {
          if (inFlight === 0) resolve();
          return;
        }
        const taskIdx = next++;
        const task = tasks[taskIdx];
        inFlight++;
        worker.onmessage = (ev: MessageEvent<{ kind: string; id: number; result?: ScreenResult; message?: string }>) => {
          inFlight--;
          if (ev.data.kind === 'result' && ev.data.result) {
            results[taskIdx] = ev.data.result;
            done++;
            issuesFound += ev.data.result.issues.length;
            onProgress?.({
              done,
              total,
              currentLayout: task.layout.name,
              currentLang: task.lang as BatchProgress['currentLang'],
              issuesFound,
              elapsedMs: performance.now() - start,
            });
            if (done >= tasks.length || this.cancelled) resolve();
            else assign(worker);
          } else if (ev.data.kind === 'error') {
            reject(new Error(ev.data.message ?? 'worker 执行失败'));
          } else {
            assign(worker);
          }
        };
        worker.onerror = (e) => {
          inFlight--;
          reject(e);
        };
        worker.postMessage({
          kind: 'run',
          id: taskIdx,
          layout: task.layout,
          table: task.table,
          lang: task.lang,
          worstCase: input.worstCase,
        });
      };
      this.workers.forEach((w) => assign(w));
    });

    this.dispose();
    return results.filter(Boolean);
  }

  private async runOnMainThread(
    tasks: BatchTask[],
    input: BatchInput,
    total: number,
    onProgress: ((p: BatchProgress) => void) | undefined,
    start: number,
  ): Promise<ScreenResult[]> {
    this.registry = new FontRegistry();
    await this.registry.hydrate(input.fonts);
    this.fallbackG = createMeasureContext();
    this.registry.bindGraphics(this.fallbackG);

    const results: ScreenResult[] = [];
    let issuesFound = 0;
    for (let i = 0; i < tasks.length; i++) {
      if (this.cancelled) break;
      const task = tasks[i];
      const result = runScreen(task.layout, task.table, {
        registry: this.registry,
        g: this.fallbackG,
        worstCase: input.worstCase,
      });
      results.push(result);
      issuesFound += result.issues.length;
      onProgress?.({
        done: i + 1,
        total,
        currentLayout: task.layout.name,
        currentLang: task.lang as BatchProgress['currentLang'],
        issuesFound,
        elapsedMs: performance.now() - start,
      });
      // 每 16 个任务让出一次事件循环，保持 UI 可响应
      if (i % 16 === 15) await new Promise((r) => setTimeout(r, 0));
    }
    return results;
  }
}

type BatchTask = { layout: LayoutDocument; table: TextTable; lang: string };
