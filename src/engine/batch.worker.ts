/**
 * 批处理 Worker：接收项目数据快照与任务分片，
 * 用 OffscreenCanvas 构造测量环境并跑 Pipeline，回传排版结果与问题。
 * 字体 ArrayBuffer 使用 Transferable 零拷贝转移。
 */
import { CanvasTextMeasurer } from '../engine/canvasMeasurer';
import { FontResolver } from '../core/measurer';
import { Pipeline } from '../core/pipeline';
import type {
  BatchReport,
  FontDef,
  LanguageDef,
  ProjectData,
} from '../core/types';

export interface WorkerInit {
  type: 'init';
  fonts: FontDef[];
}

export interface WorkerJob {
  type: 'job';
  jobId: number;
  data: ProjectData;
  screenIds: string[];
  languageCodes: string[];
  profileIds: string[];
}

export type WorkerRequest = WorkerInit | WorkerJob;

export interface WorkerResponse {
  type: 'result';
  jobId: number;
  report: BatchReport;
}

let resolver: FontResolver | undefined;
let measureCanvas: OffscreenCanvas | undefined;
let measureCtx: OffscreenCanvasRenderingContext2D | undefined;

function ensureMeasurer(language: LanguageDef): CanvasTextMeasurer {
  if (!measureCanvas) {
    measureCanvas = new OffscreenCanvas(4096, 256);
    measureCtx = measureCanvas.getContext('2d')!;
  }
  return new CanvasTextMeasurer(measureCtx!, resolver!, language.fontStack);
}

self.onmessage = (ev: MessageEvent<WorkerRequest>): void => {
  const msg = ev.data;
  if (msg.type === 'init') {
    resolver = new FontResolver(msg.fonts);
    return;
  }
  if (msg.type === 'job') {
    const pipeline = new Pipeline(msg.data, (lang) => ensureMeasurer(lang));
    const report = pipeline.run({
      screenIds: msg.screenIds,
      languageCodes: msg.languageCodes,
      profileIds: msg.profileIds,
    });
    const response: WorkerResponse = { type: 'result', jobId: msg.jobId, report };
    (self as unknown as Worker).postMessage(response);
  }
};
