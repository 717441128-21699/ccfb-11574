/**
 * 应用外壳：顶栏（导入、批处理、进度、吞吐统计）+ 三栏布局，
 * 负责订阅 store 并把状态分发给三个子视图。
 */
import { store } from './store';
import { Sidebar } from './sidebar';
import { IssuePanel } from './issuePanel';
import { CanvasGridView } from './canvasView';
import type { AppState } from './store';

export class App {
  private sidebar = new Sidebar(document.getElementById('sidebar')!);
  private issues = new IssuePanel(document.getElementById('issue-panel')!);
  private grid = new CanvasGridView(document.getElementById('canvas-area')!);

  constructor() {
    this.bindToolbar();
    store.subscribe((state) => this.render(state));
    this.render(store.state);
  }

  private bindToolbar(): void {
    document.getElementById('btn-run')!.addEventListener('click', () => void store.runBatch());
    document.getElementById('btn-cancel')!.addEventListener('click', () => store.cancelBatch());
    document.getElementById('btn-frames')!.addEventListener('click', () => store.toggleFrames());

    const screenInput = document.getElementById('file-screens') as HTMLInputElement;
    const tableInput = document.getElementById('file-table') as HTMLInputElement;
    document.getElementById('btn-import-screens')!.addEventListener('click', () => screenInput.click());
    document.getElementById('btn-import-table')!.addEventListener('click', () => tableInput.click());
    screenInput.addEventListener('change', async () => {
      if (screenInput.files?.[0]) await store.importScreens(screenInput.files[0]);
      screenInput.value = '';
    });
    tableInput.addEventListener('change', async () => {
      if (tableInput.files?.[0]) await store.importTextTable(tableInput.files[0]);
      tableInput.value = '';
    });
  }

  private render(state: AppState): void {
    this.sidebar.render(state);
    this.grid.render(state);
    this.issues.render(state);
    this.renderToolbar(state);
  }

  private renderToolbar(state: AppState): void {
    const runBtn = document.getElementById('btn-run') as HTMLButtonElement;
    const cancelBtn = document.getElementById('btn-cancel') as HTMLButtonElement;
    const framesBtn = document.getElementById('btn-frames') as HTMLButtonElement;
    runBtn.disabled = state.running;
    cancelBtn.disabled = !state.running;
    framesBtn.textContent = state.showControlFrames ? '隐藏控件框' : '显示控件框';

    const progressWrap = document.getElementById('progress-wrap')!;
    const progressBar = document.getElementById('progress-bar') as HTMLElement;
    const progressText = document.getElementById('progress-text')!;
    if (state.running && state.progress) {
      progressWrap.style.display = 'block';
      const pct = (state.progress.done / Math.max(1, state.progress.total)) * 100;
      progressBar.style.width = `${pct}%`;
      progressText.textContent = `${state.progress.done}/${state.progress.total} 分片 · ${state.progress.issues} 问题 · ${(state.progress.elapsedMs / 1000).toFixed(1)}s`;
    } else {
      progressWrap.style.display = 'none';
    }

    const stats = document.getElementById('stats')!;
    if (state.report) {
      const r = state.report;
      const errs = r.issues.filter((i) => i.severity === 'error').length;
      const warns = r.issues.filter((i) => i.severity === 'warning').length;
      const throughput = Math.round(r.totalLayouts / (r.elapsedMs / 1000));
      const projected5min = throughput * 300;
      stats.innerHTML = `
        <span class="stat-chip">排版 ${r.totalLayouts} 次</span>
        <span class="stat-chip" style="color:var(--error)">错误 ${errs}</span>
        <span class="stat-chip" style="color:var(--warning)">警告 ${warns}</span>
        <span class="stat-chip">耗时 ${(r.elapsedMs / 1000).toFixed(2)}s</span>
        <span class="stat-chip">吞吐 ${throughput}/s · 5 分钟可排 ${projected5min.toLocaleString()} 个</span>`;
    } else {
      stats.innerHTML = '';
    }

    const banner = document.getElementById('error-banner')!;
    if (state.lastError) {
      banner.style.display = 'block';
      banner.textContent = state.lastError;
    } else {
      banner.style.display = 'none';
    }
  }
}
