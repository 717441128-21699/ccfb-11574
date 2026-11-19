/**
 * 应用全局状态（轻量发布订阅，不引第三方框架）。
 */
import type {
  BatchProgress,
  BatchReport,
  FontConfig,
  Issue,
  LangCode,
  LayoutDocument,
  ScreenResult,
  TextTable,
  WorstCaseVars,
} from './types';
import { createDefaultFontConfig, FontRegistry } from './text/fontResolver';
import { importLayout, importTextTables } from './io/importers';
import { buildDemoCsv, buildDemoLayouts, DEMO_LANGS } from './data/sampleData';

export type IssueFilter = 'all' | Issue['type'];

export interface AppState {
  layouts: LayoutDocument[];
  selectedLayoutId: string | null;
  tables: Map<LangCode, TextTable>;
  languages: LangCode[];
  selectedLangs: LangCode[];
  registry: FontRegistry;
  report: BatchReport | null;
  progress: BatchProgress | null;
  running: boolean;
  selectedIssue: Issue | null;
  filter: IssueFilter;
  worstCase: WorstCaseVars;
  lastError: string | null;
}

type Listener = (state: AppState) => void;

class Store {
  private state: AppState;
  private listeners = new Set<Listener>();

  constructor() {
    const registry = new FontRegistry();
    for (const cfg of createDefaultFontConfig()) registry.registerConfig(cfg);
    this.state = {
      layouts: [],
      selectedLayoutId: null,
      tables: new Map(),
      languages: [],
      selectedLangs: [],
      registry,
      report: null,
      progress: null,
      running: false,
      selectedIssue: null,
      filter: 'all',
      worstCase: { values: {} },
      lastError: null,
    };
  }

  getState(): AppState {
    return this.state;
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private patch(p: Partial<AppState>): void {
    this.state = { ...this.state, ...p };
    for (const fn of this.listeners) fn(this.state);
  }

  loadDemo(): void {
    try {
      const layouts = buildDemoLayouts();
      const tables = importTextTables(buildDemoCsv(), 'demo-texts.csv');
      const languages = [...DEMO_LANGS] as LangCode[];
      this.patch({
        layouts,
        selectedLayoutId: layouts[0]?.id ?? null,
        tables,
        languages,
        selectedLangs: languages,
        report: null,
        selectedIssue: null,
        lastError: null,
      });
    } catch (err) {
      this.patch({ lastError: (err as Error).message });
    }
  }

  async importLayoutFiles(files: File[]): Promise<void> {
    try {
      const docs: LayoutDocument[] = [];
      for (const f of files) {
        docs.push(importLayout(await f.text(), f.name));
      }
      const merged = [...this.state.layouts.filter((l) => !docs.some((d) => d.id === l.id)), ...docs];
      this.patch({
        layouts: merged,
        selectedLayoutId: this.state.selectedLayoutId ?? merged[0]?.id ?? null,
        lastError: null,
      });
    } catch (err) {
      this.patch({ lastError: `布局导入失败：${(err as Error).message}` });
    }
  }

  async importCsv(file: File): Promise<void> {
    try {
      const tables = importTextTables(await file.text(), file.name);
      const merged = new Map(this.state.tables);
      for (const [lang, t] of tables) merged.set(lang, t);
      const languages = [...merged.keys()].sort();
      this.patch({
        tables: merged,
        languages,
        selectedLangs: languages,
        lastError: null,
      });
    } catch (err) {
      this.patch({ lastError: `文本表导入失败：${(err as Error).message}` });
    }
  }

  registerFontConfig(cfg: FontConfig): void {
    this.state.registry.registerConfig(cfg);
    this.patch({});
  }

  selectLayout(id: string): void {
    this.patch({ selectedLayoutId: id, selectedIssue: null });
  }

  toggleLang(lang: LangCode): void {
    const set = new Set(this.state.selectedLangs);
    if (set.has(lang)) set.delete(lang);
    else set.add(lang);
    this.patch({ selectedLangs: this.state.languages.filter((l) => set.has(l)) });
  }

  setReport(report: BatchReport | null): void {
    this.patch({ report });
  }

  setProgress(progress: BatchProgress | null): void {
    this.patch({ progress });
  }

  setRunning(running: boolean): void {
    this.patch({ running });
  }

  selectIssue(issue: Issue | null): void {
    this.patch({ selectedIssue: issue, selectedLayoutId: issue?.layoutId ?? this.state.selectedLayoutId });
  }

  setFilter(filter: IssueFilter): void {
    this.patch({ filter });
  }

  setError(message: string | null): void {
    this.patch({ lastError: message });
  }
}

export const store = new Store();
