import type { ScreenDef, ScreenReport } from './types';
import { checkScreen, type CheckEnv } from './checker';

export interface RunProgress {
  done: number;
  total: number;
  elapsedMs: number;
}

/**
 * 批量检查:screens × langs,分片让出主线程保 UI 响应。
 * 测量有缓存,同一句子同一字体只测一次,3000×8 级别轻松跑进秒级。
 */
export async function runChecks(
  screens: ScreenDef[],
  langs: string[],
  env: CheckEnv,
  onProgress?: (p: RunProgress) => void,
): Promise<Map<string, ScreenReport>> {
  const reports = new Map<string, ScreenReport>();
  const total = screens.length * langs.length;
  let done = 0;
  const t0 = performance.now();
  let sinceYield = 0;

  for (const screen of screens) {
    for (const lang of langs) {
      reports.set(`${screen.id}::${lang}`, checkScreen(screen, lang, env));
      done++;
    }
    if (++sinceYield >= 40) {
      sinceYield = 0;
      onProgress?.({ done, total, elapsedMs: performance.now() - t0 });
      await new Promise((r) => setTimeout(r, 0));
    }
  }
  onProgress?.({ done, total, elapsedMs: performance.now() - t0 });
  return reports;
}
