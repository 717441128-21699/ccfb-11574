/**
 * Worker 池调度：把「界面 × 语言 × 档案」切成分片分发给多个 Worker，
 * 汇总结果并上报进度。Worker 数默认 = hardwareConcurrency - 1。
 * 不支持 Worker 的环境退化为同步流水线（见 runInline）。
 */
import { CanvasTextMeasurer } from './canvasMeasurer';
import { FontResolver } from '../core/measurer';
import { Pipeline } from '../core/pipeline';
import type {
  BatchProgress,
  BatchReport,
  FontDef,
  Issue,
  LanguageDef,
  ProjectData,
  TextLayoutResult,
} from '../core/types';
import type { WorkerJob, WorkerResponse } from './batch.worker';

export interface PoolHandle {
  promise: Promise<BatchReport>;
  cancel: () => void;
}

export class WorkerPool {
  private workers: Worker[] = [];
  private cancelling = false;
  private initialized = false;

  constructor(private size: number = Math.max(1, (navigator.hardwareConcurrency || 4) - 1)) {}

  async init(fonts: FontDef[]): Promise<void> {
    if (this.initialized) return;
    for (let i = 0; i < this.size; i++) {
      const worker = new Worker(new URL('./batch.worker.ts', import.meta.url), { type: 'module' });
      worker.postMessage({ type: 'init', fonts });
      this.workers.push(worker);
    }
    this.initialized = true;
  }

  run(
    data: ProjectData,
    job: { screenIds: string[]; languageCodes: string[]; profileIds: string[] },
    onProgress: (p: BatchProgress) => void,
  ): PoolHandle {
    const shards = shardScreens(job.screenIds, this.workers.length);
    let done = 0;
    const total = shards.length;
    const allIssues: Issue[] = [];
    const allLayouts: TextLayoutResult[] = [];
    const perLanguage: Record<string, number> = {};
    const startedAt = performance.now();
    let nextJobId = 0;

    const pushReport = (report: BatchReport): void => {
      allIssues.push(...report.issues);
      allLayouts.push(...report.layouts);
      for (const [k, v] of Object.entries(report.perLanguage)) perLanguage[k] = (perLanguage[k] ?? 0) + v;
    };

    const promise = new Promise<BatchReport>((resolve, reject) => {
      let cursor = 0;
      const assign = (worker: Worker): void => {
        if (this.cancelling) {
          reject(new Error('批处理已取消'));
          return;
        }
        if (cursor >= shards.length) return;
        const shard = shards[cursor++];
        const jobId = nextJobId++;
        const payload: WorkerJob = {
          type: 'job',
          jobId,
          data,
          screenIds: shard,
          languageCodes: job.languageCodes,
          profileIds: job.profileIds,
        };
        worker.onmessage = (ev: MessageEvent<WorkerResponse>) => {
          if (ev.data.type !== 'result' || ev.data.jobId !== jobId) return;
          pushReport(ev.data.report);
          done++;
          onProgress({
            done,
            total,
            issues: allIssues.length,
            startedAt,
            elapsedMs: performance.now() - startedAt,
          });
          if (done === shards.length) {
            resolve({
              issues: allIssues,
              layouts: allLayouts,
              totalLayouts: allLayouts.length,
              elapsedMs: performance.now() - startedAt,
              perLanguage,
            });
          } else {
            assign(worker);
          }
        };
        worker.onerror = (e): void => reject(e.error ?? new Error(e.message));
        worker.postMessage(payload);
      };
      this.workers.forEach(assign);
    });

    return {
      promise,
      cancel: (): void => {
        this.cancelling = true;
        this.workers.forEach((w) => w.terminate());
      },
    };
  }

  dispose(): void {
    this.workers.forEach((w) => w.terminate());
    this.workers = [];
    this.initialized = false;
    this.cancelling = false;
  }
}

/** 界面轮转分片，保证各 Worker 负载均衡（大界面打散）。 */
export function shardScreens(screenIds: string[], workers: number): string[][] {
  const shards: string[][] = Array.from({ length: Math.min(workers, screenIds.length) }, () => []);
  screenIds.forEach((id, i) => shards[i % shards.length].push(id));
  return shards.filter((s) => s.length > 0);
}

/** 无 Worker 环境的同步回退（主线程测量，会阻塞 UI，仅用于降级）。 */
export function runInline(
  data: ProjectData,
  fonts: FontDef[],
  job: { screenIds: string[]; languageCodes: string[]; profileIds: string[] },
  onProgress?: (p: BatchProgress) => void,
): BatchReport {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  const resolver = new FontResolver(fonts);
  const pipeline = new Pipeline(data, (lang: LanguageDef) => new CanvasTextMeasurer(ctx, resolver, lang.fontStack));
  const total = job.screenIds.length * job.languageCodes.length * Math.max(1, job.profileIds.length);
  let done = 0;
  const startedAt = performance.now();
  const report = pipeline.run(job, {
    onProgress: () => {
      done++;
      onProgress?.({ done, total, issues: 0, startedAt, elapsedMs: performance.now() - startedAt });
    },
  });
  return report;
}
