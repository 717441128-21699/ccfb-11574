/**
 * 集中式应用状态（轻量 store，无框架依赖）。
 * 所有异步动作（导入/批处理）改 state 后调用 emit，视图按状态重渲染。
 */
import { runInline, WorkerPool } from '../engine/workerPool';
import { buildSampleProject } from '../data/sampleData';
import { importFont, parseScreens, parseTextTableCsv, parseTextTableJson } from '../core/importers';
import { resetIssueSequence } from '../core/detector';
import type {
  BatchProgress,
  BatchReport,
  FontDef,
  Issue,
  ProjectData,
  ScreenDef,
  TextLayoutResult,
} from '../core/types';

export type IssueFilter = 'all' | 'error' | 'warning' | 'info';

export interface AppState {
  project: ProjectData;
  selectedScreenId: string;
  selectedLanguages: string[];
  selectedProfileIds: string[];
  report: BatchReport | null;
  progress: BatchProgress | null;
  running: boolean;
  highlightIssueId: string | undefined;
  filter: IssueFilter;
  showControlFrames: boolean;
  fontsLoading: string | null;
  lastError: string | null;
}

type Listener = (state: AppState) => void;

class AppStore {
  state: AppState;
  private listeners = new Set<Listener>();
  private pool: WorkerPool | null = null;

  constructor() {
    const project = buildSampleProject();
    this.state = {
      project,
      selectedScreenId: project.screens[0].id,
      selectedLanguages: project.languages.map((l) => l.code),
      selectedProfileIds: ['worst_case'],
      report: null,
      progress: null,
      running: false,
      highlightIssueId: undefined,
      filter: 'all',
      showControlFrames: true,
      fontsLoading: null,
      lastError: null,
    };
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    this.state = { ...this.state };
    for (const fn of this.listeners) fn(this.state);
  }

  update(patch: Partial<AppState>): void {
    Object.assign(this.state, patch);
    this.emit();
  }

  selectScreen(id: string): void {
    this.update({ selectedScreenId: id, highlightIssueId: undefined });
  }

  toggleLanguage(code: string): void {
    const set = new Set(this.state.selectedLanguages);
    if (set.has(code)) set.delete(code);
    else set.add(code);
    this.update({ selectedLanguages: [...set] });
  }

  toggleProfile(id: string): void {
    const set = new Set(this.state.selectedProfileIds);
    if (set.has(id)) set.delete(id);
    else set.add(id);
    this.update({ selectedProfileIds: [...set] });
  }

  setFilter(filter: IssueFilter): void {
    this.update({ filter });
  }

  setHighlight(issueId: string | undefined): void {
    this.update({ highlightIssueId: issueId });
  }

  toggleFrames(): void {
    this.update({ showControlFrames: !this.state.showControlFrames });
  }

  // ---------- 导入 ----------

  async importScreens(file: File): Promise<void> {
    try {
      const json = JSON.parse(await file.text());
      const screens: ScreenDef[] = parseScreens(json, file.name);
      this.state.project.screens = screens;
      this.state.selectedScreenId = screens[0].id;
      this.update({ lastError: null });
    } catch (e) {
      this.update({ lastError: `布局导入失败：${(e as Error).message}` });
    }
  }

  async importTextTable(file: File): Promise<void> {
    try {
      const text = await file.text();
      const columns = this.state.project.languages.map((l) => l.tableColumn);
      const table = file.name.toLowerCase().endsWith('.csv')
        ? parseTextTableCsv(text, file.name, columns)
        : parseTextTableJson(JSON.parse(text), file.name, columns);
      const others = this.state.project.tables.filter((t) => t.sourceFile !== table.sourceFile);
      this.state.project.tables = [...others, table];
      this.update({ lastError: null });
    } catch (e) {
      this.update({ lastError: `文本表导入失败：${(e as Error).message}` });
    }
  }

  async importFonts(files: File[], family: string): Promise<void> {
    this.update({ fontsLoading: family });
    try {
      const added: FontDef[] = [];
      for (const file of files) {
        const buf = await file.arrayBuffer();
        const lower = file.name.toLowerCase();
        const italic = lower.includes('italic') || lower.includes('oblique');
        const weightMatch = lower.match(/(\d{3})/);
        const weight = weightMatch ? Number(weightMatch[1]) : 400;
        added.push(await importFont(family, weight, italic ? 'italic' : 'normal', buf, file.name));
      }
      const kept = this.state.project.fonts.filter((f) => f.family !== family);
      this.state.project.fonts = [...kept, ...added];
      this.update({ lastError: null, fontsLoading: null });
    } catch (e) {
      this.update({ lastError: `字体导入失败：${(e as Error).message}`, fontsLoading: null });
    }
  }

  registerSystemFont(family: string): void {
    if (this.state.project.fonts.some((f) => f.family === family)) return;
    this.state.project.fonts.push({
      family,
      weight: 400,
      style: 'normal',
      isSystem: true,
      sourceName: `system:${family}`,
    });
    this.emit();
  }

  // ---------- 批处理 ----------

  async runBatch(): Promise<void> {
    const { project, selectedLanguages, selectedProfileIds } = this.state;
    if (selectedLanguages.length === 0) {
      this.update({ lastError: '请至少选择一种语言' });
      return;
    }
    resetIssueSequence();
    this.update({ running: true, report: null, highlightIssueId: undefined, lastError: null });
    const job = {
      screenIds: project.screens.map((s) => s.id),
      languageCodes: selectedLanguages,
      profileIds: selectedProfileIds.length ? selectedProfileIds : ['worst_case'],
    };

    try {
      let report: BatchReport;
      if (typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined') {
        this.pool ??= new WorkerPool();
        await this.pool.init(project.fonts);
        const handle = this.pool.run(project, job, (progress) => this.update({ progress }));
        report = await handle.promise;
      } else {
        report = runInline(project, project.fonts, job, (progress) => this.update({ progress }));
      }
      this.update({ report, running: false, progress: null });
    } catch (e) {
      this.update({ running: false, progress: null, lastError: `批处理失败：${(e as Error).message}` });
    }
  }

  cancelBatch(): void {
    this.pool?.dispose();
    this.pool = null;
    this.update({ running: false, progress: null });
  }

  /** 当前界面的问题（过滤后）。 */
  issuesForScreen(screenId: string): Issue[] {
    const report = this.state.report;
    if (!report) return [];
    return report.issues.filter(
      (i) => i.screenId === screenId && (this.state.filter === 'all' || i.severity === this.state.filter),
    );
  }

  layoutsForScreen(screenId: string): TextLayoutResult[] {
    return this.state.report?.layouts.filter((l) => l.screenId === screenId) ?? [];
  }

  dispose(): void {
    this.pool?.dispose();
  }
}

export const store = new AppStore();
