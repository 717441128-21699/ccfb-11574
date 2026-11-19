/**
 * 主界面装配：顶栏 / 左栏（界面+语言）/ 中栏（预览与多语言并排）/ 右栏（问题列表）
 */
import type { BatchReport, Issue, IssueType, LangCode, LayoutDocument, ScreenResult } from '../types';
import { store } from '../store';
import { renderPreview } from './preview';
import { BatchRunner } from '../workers/BatchRunner';
import { ScreenRenderer } from '../render/ScreenRenderer';
import { runScreen, createMeasureContext } from '../engine/runner';

const LANG_LABELS: Record<string, string> = {
  en: 'English',
  de: 'Deutsch',
  fr: 'Français',
  es: 'Español',
  ru: 'Русский',
  ar: 'العربية (RTL)',
  th: 'ไทย',
  hi: 'हिन्दी',
  zh: '中文',
  ja: '日本語',
};

const ISSUE_LABELS: Record<IssueType, string> = {
  overflow: '超框',
  truncation: '截断',
  overlap: '压盖',
  'missing-glyph': '缺字',
  shrink: '缩字',
};

let previewLang: LangCode | null = null;
let compareMode = false;
let toastTimer: number | undefined;

export function mountApp(root: HTMLElement): void {
  root.innerHTML = `
    <header class="topbar">
      <h1>🌐 I18N 界面文字溢出检测</h1>
      <span class="pill" id="pill-data">未加载数据</span>
      <div class="spacer"></div>
      <button id="btn-demo">加载演示数据</button>
      <button id="btn-layout">导入布局 JSON</button>
      <button id="btn-csv">导入文本表 CSV</button>
      <input type="file" id="file-layout" class="file-input" multiple accept=".json" />
      <input type="file" id="file-csv" class="file-input" accept=".csv" />
      <button id="btn-run" class="primary" disabled>批量检测</button>
      <button id="btn-cancel" class="danger" disabled>取消</button>
    </header>
    <div class="main">
      <aside class="sidebar">
        <div class="section-title">界面布局 (<span id="layout-count">0</span>)</div>
        <div id="layout-list"></div>
        <div class="section-title">语言（勾选参与批量检测）</div>
        <div class="lang-grid" id="lang-list"></div>
        <div class="section-title">批量报告</div>
        <div id="report-summary" class="text-dim">尚未运行</div>
      </aside>
      <section class="canvas-area">
        <div class="canvas-toolbar">
          <div class="lang-tabs" id="preview-lang-tabs"></div>
          <div class="spacer" style="flex:1"></div>
          <label class="pill"><input type="checkbox" id="chk-compare" /> 多语言并排对比</label>
        </div>
        <div class="canvas-scroll" id="canvas-scroll">
          <div class="empty-state" id="empty-state">
            <h2>开始检测多语言文字溢出</h2>
            <p>点击顶栏 <b>加载演示数据</b> 快速体验，或导入真实文件：</p>
            <p><code>*.json</code> 界面布局（控件坐标 / 字号 / 溢出模式 / 文本 key）</p>
            <p><code>*.csv</code> 文本表（首行 <code>key,en,de,...,ar,th,hi</code>，行号将用于问题定位）</p>
          </div>
          <div class="canvas-wrap" id="canvas-wrap" hidden>
            <canvas id="main-canvas"></canvas>
          </div>
          <div id="compare-wrap" hidden></div>
        </div>
      </section>
      <aside class="sidebar right">
        <div class="section-title">问题列表</div>
        <div class="issue-filter" id="issue-filter"></div>
        <div id="issue-list"></div>
        <div id="issue-detail"></div>
      </aside>
    </div>
    <footer class="progress-wrap" id="progress-wrap" hidden>
      <div class="progress-bar"><div id="progress-fill" style="width:0%"></div></div>
      <div class="progress-meta">
        <span id="progress-text">准备中…</span>
        <span id="progress-timing"></span>
      </div>
    </footer>
    <div id="toast-host"></div>
  `;

  bindEvents(root);
  store.subscribe(render);
  render(store.getState());
}

function bindEvents(root: HTMLElement): void {
  root.querySelector<HTMLButtonElement>('#btn-demo')!.onclick = () => {
    store.loadDemo();
    toast('已加载演示数据：4 个界面 × 8 种语言', 'info');
  };

  const layoutInput = root.querySelector<HTMLInputElement>('#file-layout')!;
  const csvInput = root.querySelector<HTMLInputElement>('#file-csv')!;
  root.querySelector<HTMLButtonElement>('#btn-layout')!.onclick = () => layoutInput.click();
  root.querySelector<HTMLButtonElement>('#btn-csv')!.onclick = () => csvInput.click();

  layoutInput.onchange = async () => {
    if (layoutInput.files?.length) {
      await store.importLayoutFiles([...layoutInput.files]);
      layoutInput.value = '';
    }
  };
  csvInput.onchange = async () => {
    if (csvInput.files?.[0]) {
      await store.importCsv(csvInput.files[0]);
      csvInput.value = '';
    }
  };

  root.querySelector<HTMLButtonElement>('#btn-run')!.onclick = () => runBatch();
  root.querySelector<HTMLButtonElement>('#btn-cancel')!.onclick = () => runner?.cancel();
  root.querySelector<HTMLInputElement>('#chk-compare')!.onchange = (e) => {
    compareMode = (e.target as HTMLInputElement).checked;
    render(store.getState());
  };
}

/* ------------------------------ 批量运行 ------------------------------ */

let runner: BatchRunner | null = null;

async function runBatch(): Promise<void> {
  const state = store.getState();
  if (!state.layouts.length || !state.selectedLangs.length) return;
  runner = new BatchRunner();
  store.setRunning(true);
  store.setReport(null);
  store.setProgress({ done: 0, total: state.layouts.length * state.selectedLangs.length, issuesFound: 0, elapsedMs: 0 });

  try {
    const report: BatchReport = await runner.run(
      {
        layouts: state.layouts,
        tablesByLang: state.tables as Map<string, import('../types').TextTable>,
        fonts: [],
        worstCase: state.worstCase,
        languages: state.selectedLangs as unknown as string[],
      },
      (p) => store.setProgress(p),
    );
    store.setReport(report);
    const sec = (report.durationMs / 1000).toFixed(1);
    toast(`检测完成：${report.screens} 界面 × ${report.languages} 语言，发现 ${report.totalIssues} 个问题，耗时 ${sec}s`, report.totalIssues ? 'error' : 'info');
  } catch (err) {
    toast(`批量检测失败：${(err as Error).message}`);
  } finally {
    store.setRunning(false);
    store.setProgress(null);
    runner = null;
  }
}

/* ------------------------------ 渲染 ------------------------------ */

function render(state: ReturnType<typeof store.getState>): void {
  renderLayoutList(state);
  renderLangList(state);
  renderReportSummary(state);
  renderToolbar(state);
  renderIssues(state);
  renderProgress(state);
  renderToastError(state);

  const pill = document.querySelector<HTMLSpanElement>('#pill-data')!;
  pill.textContent = state.layouts.length
    ? `${state.layouts.length} 界面 · ${state.languages.length} 语言`
    : '未加载数据';
  document.querySelector<HTMLButtonElement>('#btn-run')!.disabled =
    state.running || !state.layouts.length || !state.selectedLangs.length;
  document.querySelector<HTMLButtonElement>('#btn-cancel')!.disabled = !state.running;

  const layout = state.layouts.find((l) => l.id === state.selectedLayoutId) ?? state.layouts[0];
  const empty = document.querySelector<HTMLElement>('#empty-state')!;
  const wrap = document.querySelector<HTMLElement>('#canvas-wrap')!;
  const compareWrap = document.querySelector<HTMLElement>('#compare-wrap')!;
  if (!layout) {
    empty.hidden = false;
    wrap.hidden = true;
    compareWrap.hidden = true;
    return;
  }
  empty.hidden = true;
  if (compareMode) {
    wrap.hidden = true;
    compareWrap.hidden = false;
    renderCompare(layout, state);
  } else {
    compareWrap.hidden = true;
    wrap.hidden = false;
    const lang = previewLang && state.tables.has(previewLang) ? previewLang : state.selectedLangs[0] ?? state.languages[0];
    previewLang = lang ?? null;
    if (lang) {
      const canvas = document.querySelector<HTMLCanvasElement>('#main-canvas')!;
      renderPreview(canvas, layout, lang);
    }
  }
}

function renderLayoutList(state: ReturnType<typeof store.getState>): void {
  const host = document.querySelector<HTMLElement>('#layout-list')!;
  document.querySelector('#layout-count')!.textContent = String(state.layouts.length);
  host.innerHTML = '';
  const issueCountByLayout = new Map<string, number>();
  state.report?.results.forEach((r) => {
    if (r.issues.length) issueCountByLayout.set(r.layoutId, (issueCountByLayout.get(r.layoutId) ?? 0) + r.issues.length);
  });
  for (const layout of state.layouts) {
    const count = issueCountByLayout.get(layout.id) ?? 0;
    const btn = document.createElement('button');
    btn.className = `layout-item ${state.selectedLayoutId === layout.id ? 'active' : ''}`;
    btn.innerHTML = `<span class="name">${escapeHtml(layout.name)}</span>
      <span class="meta">${layout.widgets.length} 控件 ·
      <span class="badge ${count === 0 ? 'zero' : ''}">${count}</span> 问题</span>`;
    btn.onclick = () => store.selectLayout(layout.id);
    host.appendChild(btn);
  }
}

function renderLangList(state: ReturnType<typeof store.getState>): void {
  const host = document.querySelector<HTMLElement>('#lang-list')!;
  host.innerHTML = '';
  for (const lang of state.languages) {
    const active = state.selectedLangs.includes(lang);
    const btn = document.createElement('button');
    btn.className = `lang-chip ${active ? 'active' : ''}`;
    btn.innerHTML = `${LANG_LABELS[lang] ?? lang} ${lang === 'ar' ? '<span class="dir-tag">RTL</span>' : ''}`;
    btn.onclick = () => store.toggleLang(lang);
    host.appendChild(btn);
  }
}

function renderToolbar(state: ReturnType<typeof store.getState>): void {
  const host = document.querySelector<HTMLElement>('#preview-lang-tabs')!;
  host.innerHTML = '';
  const langs = state.selectedLangs.length ? state.selectedLangs : state.languages;
  for (const lang of langs) {
    const btn = document.createElement('button');
    btn.className = `lang-tab ${previewLang === lang ? 'active' : ''}`;
    btn.textContent = LANG_LABELS[lang] ?? lang;
    btn.onclick = () => {
      previewLang = lang;
      render(state);
    };
    host.appendChild(btn);
  }
}

function renderReportSummary(state: ReturnType<typeof store.getState>): void {
  const host = document.querySelector<HTMLElement>('#report-summary')!;
  const report = state.report;
  if (!report) {
    host.className = 'text-dim';
    host.textContent = '尚未运行';
    return;
  }
  const entries = Object.entries(report.byType)
    .filter(([, n]) => n > 0)
    .map(([t, n]) => `<div class="stat-box"><div class="num">${n}</div><div class="label">${ISSUE_LABELS[t as IssueType]}</div></div>`)
    .join('');
  host.className = '';
  host.innerHTML = `
    <div class="stats-grid">
      <div class="stat-box"><div class="num">${report.totalIssues}</div><div class="label">问题总数</div></div>
      <div class="stat-box"><div class="num">${(report.durationMs / 1000).toFixed(1)}s</div><div class="label">总耗时</div></div>
      ${entries}
    </div>`;
}

function renderIssues(state: ReturnType<typeof store.getState>): void {
  const filterHost = document.querySelector<HTMLElement>('#issue-filter')!;
  const listHost = document.querySelector<HTMLElement>('#issue-list')!;
  const detailHost = document.querySelector<HTMLElement>('#issue-detail')!;

  const types: (IssueFilterLike | 'all')[] = ['all', 'overflow', 'truncation', 'overlap', 'missing-glyph', 'shrink'];
  filterHost.innerHTML = '';
  for (const t of types) {
    const btn = document.createElement('button');
    btn.className = state.filter === t ? 'active' : '';
    btn.textContent = t === 'all' ? '全部' : ISSUE_LABELS[t as IssueType];
    btn.onclick = () => store.setFilter(t as typeof state.filter);
    filterHost.appendChild(btn);
  }

  const layoutId = state.selectedLayoutId;
  const issues = collectVisibleIssues(state).filter(
    (i) => (!layoutId || i.layoutId === layoutId) && (state.filter === 'all' || i.type === state.filter),
  );

  listHost.innerHTML = '';
  if (!issues.length) {
    listHost.innerHTML = '<p class="text-dim" style="font-size:12px">当前视图没有问题</p>';
    detailHost.innerHTML = '';
    return;
  }
  for (const iss of issues.slice(0, 300)) {
    const card = document.createElement('div');
    card.className = `issue-card ${iss.type} ${state.selectedIssue === iss ? 'selected' : ''}`;
    card.innerHTML = `
      <div class="issue-head">
        <span class="issue-type">${ISSUE_LABELS[iss.type]}</span>
        <span class="issue-lang">${iss.lang}</span>
        ${iss.sourceRow > 0 ? `<span class="issue-row">文本表第 ${iss.sourceRow} 行</span>` : ''}
      </div>
      <div class="issue-msg">${escapeHtml(iss.message)}</div>
      <div class="issue-widget">${escapeHtml(iss.widgetId)}${iss.relatedWidgetId ? ` ↔ ${escapeHtml(iss.relatedWidgetId)}` : ''} · key=${escapeHtml(iss.textKey ?? '—')}</div>`;
    card.onclick = () => {
      store.selectIssue(iss);
      previewLang = iss.lang;
      render(state);
      renderIssueDetail(iss);
    };
    listHost.appendChild(card);
  }
  if (issues.length > 300) {
    const more = document.createElement('p');
    more.className = 'text-dim';
    more.style.fontSize = '12px';
    more.textContent = `仅显示前 300 条，共 ${issues.length} 条`;
    listHost.appendChild(more);
  }
  if (state.selectedIssue) renderIssueDetail(state.selectedIssue);
  else detailHost.innerHTML = '';
}

function renderIssueDetail(iss: Issue): void {
  const host = document.querySelector<HTMLElement>('#issue-detail')!;
  const metrics = iss.metrics
    ? Object.entries(iss.metrics)
        .map(([k, v]) => `<dt>${escapeHtml(k)}</dt><dd class="mono">${typeof v === 'number' ? v.toFixed(1) : String(v)}</dd>`)
        .join('')
    : '';
  host.innerHTML = `
    <div class="section-title">问题详情</div>
    <div class="detail-panel">
      <dl>
        <dt>类型</dt><dd>${ISSUE_LABELS[iss.type]}（${iss.severity}）</dd>
        <dt>语言</dt><dd>${iss.lang}</dd>
        <dt>界面</dt><dd>${escapeHtml(iss.layoutId)}</dd>
        <dt>控件</dt><dd class="mono">${escapeHtml(iss.widgetId)}</dd>
        <dt>文本 Key</dt><dd class="mono">${escapeHtml(iss.textKey ?? '—')}</dd>
        <dt>定位行号</dt><dd class="mono">${iss.sourceRow > 0 ? `第 ${iss.sourceRow} 行` : '内联文本（无行号）'}</dd>
        ${metrics}
      </dl>
    </div>`;
}

function collectVisibleIssues(state: ReturnType<typeof store.getState>): Issue[] {
  if (!state.report) return [];
  const map = new Map<string, Issue>();
  for (const r of state.report.results) for (const i of r.issues) map.set(issueKey(i), i);
  return [...map.values()];
}

function issueKey(i: Issue): string {
  return `${i.layoutId}|${i.lang}|${i.widgetId}|${i.type}|${i.sourceRow}`;
}

function renderProgress(state: ReturnType<typeof store.getState>): void {
  const wrap = document.querySelector<HTMLElement>('#progress-wrap')!;
  if (!state.running || !state.progress) {
    wrap.hidden = true;
    return;
  }
  wrap.hidden = false;
  const p = state.progress;
  const pct = ((p.done / p.total) * 100).toFixed(1);
  document.querySelector<HTMLElement>('#progress-fill')!.style.width = `${pct}%`;
  document.querySelector<HTMLElement>('#progress-text')!.textContent =
    `${p.done} / ${p.total} · 当前 ${p.currentLayout ?? ''}（${p.currentLang ?? ''}）· 已发现 ${p.issuesFound} 个问题`;
  const throughput = p.elapsedMs > 0 ? (p.done / (p.elapsedMs / 1000)).toFixed(1) : '—';
  const eta = p.done > 0 ? ((p.total - p.done) * (p.elapsedMs / p.done) / 1000).toFixed(0) : '—';
  document.querySelector<HTMLElement>('#progress-timing')!.textContent = `${pct}% · ${throughput} 屏/秒 · 预计剩余 ${eta}s`;
}

function renderToastError(state: ReturnType<typeof store.getState>): void {
  const host = document.querySelector<HTMLElement>('#toast-host')!;
  if (state.lastError) {
    host.innerHTML = `<div class="toast">${escapeHtml(state.lastError)}</div>`;
    window.setTimeout(() => {
      if (store.getState().lastError === state.lastError) store.setError(null);
    }, 6000);
  } else if (!host.querySelector('.toast.info')) {
    host.innerHTML = '';
  }
}

function toast(message: string, kind: 'info' | 'error' = 'info'): void {
  const host = document.querySelector<HTMLElement>('#toast-host')!;
  host.innerHTML = `<div class="toast ${kind === 'info' ? 'info' : ''}">${escapeHtml(message)}</div>`;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (host.innerHTML = ''), 5000);
}

/* ------------------------------ 多语言并排 ------------------------------ */

function renderCompare(layout: LayoutDocument, state: ReturnType<typeof store.getState>): void {
  const host = document.querySelector<HTMLElement>('#compare-wrap')!;
  const langs = state.selectedLangs.length ? state.selectedLangs : state.languages;
  host.className = 'compare-grid';
  host.style.gridTemplateColumns = `repeat(${Math.min(langs.length, 2)}, minmax(320px, 1fr))`;
  host.innerHTML = '';
  const g = createMeasureContext();
  state.registry.bindGraphics(g);

  for (const lang of langs) {
    const table = state.tables.get(lang);
    if (!table) continue;
    const result: ScreenResult = runScreen(layout, table, {
      registry: state.registry,
      g,
      worstCase: state.worstCase,
    });
    const cell = document.createElement('div');
    cell.className = 'compare-cell';
    const errorCount = result.issues.length;
    cell.innerHTML = `
      <div class="cell-head">
        <span>${LANG_LABELS[lang] ?? lang} <span class="text-dim mono">${lang}</span></span>
        <span class="badge ${errorCount === 0 ? 'zero' : ''}">${errorCount}</span>
      </div>
      <canvas></canvas>`;
    host.appendChild(cell);
    const canvas = cell.querySelector('canvas')!;
    const renderer = new ScreenRenderer(canvas);
    // 对比视图单元格宽度由网格决定，高度按设计宽高比换算
    const cellWidth = cell.clientWidth || 480;
    renderer.render(layout, result.textLayouts, {
      issues: result.issues,
      containerWidth: cellWidth,
      containerHeight: (cellWidth * layout.designHeight) / layout.designWidth,
    });
  }
}

/* ------------------------------ 工具 ------------------------------ */

type IssueFilterLike = Issue['type'];

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
