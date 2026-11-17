import type { Issue, ScreenDef, ScreenReport, TextTable } from './types';
import { FontManager } from './fonts';
import { Measurer } from './measure';
import { parseTextTable } from './table';
import { runChecks } from './runner';
import { renderScreen } from './render';
import { DEMO_CSV, demoLayout, stressLayout } from './demo';
import type { CheckEnv } from './checker';

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;

// ---------- 状态 ----------
const fonts = new FontManager();
const measurer = new Measurer();
let screens: ScreenDef[] = [];
let table: TextTable = { langs: [], entries: new Map() };
let reports = new Map<string, ScreenReport>();
let allIssues: Issue[] = [];
let activeLangs: string[] = [];
let selectedScreenId: string | null = null;
let focusWidgetId: string | undefined;
let lastRunMs = 0;

// ---------- 小工具 ----------
const ui = {
  status: $('#data-status'),
  runBtn: $('#btn-run') as HTMLButtonElement,
  exportBtn: $('#btn-export') as HTMLButtonElement,
  progressWrap: $('#progress-wrap'),
  progress: $('#progress') as HTMLProgressElement,
  progressText: $('#progress-text'),
  screenList: $('#screen-list'),
  screenCount: $('#screen-count'),
  screenFilter: $('#screen-filter') as HTMLInputElement,
  issueCount: $('#issue-count'),
  issueFilter: $('#issue-filter') as HTMLSelectElement,
  issueBody: $('#issue-table tbody') as HTMLTableSectionElement,
  canvasGrid: $('#canvas-grid'),
  langList: $('#lang-list'),
};

function readVars(): Record<string, string> {
  const vars: Record<string, string> = {
    player: ($('#var-player') as HTMLInputElement).value,
    count: ($('#var-count') as HTMLInputElement).value,
  };
  const extra = ($('#var-extra') as HTMLInputElement).value.trim();
  if (extra) {
    try {
      Object.assign(vars, JSON.parse(extra));
    } catch {
      alert('自定义变量 JSON 格式错误,已忽略');
    }
  }
  return vars;
}

function opts() {
  return {
    leading: Number(($('#opt-leading') as HTMLInputElement).value) || 1.25,
    iconRatio: Number(($('#opt-icon') as HTMLInputElement).value) || 1.0,
    showBoxes: ($('#opt-boxes') as HTMLInputElement).checked,
  };
}

function updateStatus() {
  ui.status.textContent =
    `布局 ${screens.length} 界面 · 文本表 ${table.entries.size} 键 × ${table.langs.length} 语言` +
    ` · 游戏字体 ${fonts.loadedFonts.length} 个` +
    (lastRunMs ? ` · 上次检查 ${(lastRunMs / 1000).toFixed(2)}s` : '');
  ui.runBtn.disabled = !(screens.length && table.langs.length);
}

// ---------- 导入 ----------
function pickFile(input: HTMLInputElement): Promise<FileList | null> {
  return new Promise((resolve) => {
    input.onchange = () => resolve(input.files);
    input.value = '';
    input.click();
  });
}

$('#btn-load-layout').addEventListener('click', async () => {
  const files = await pickFile($('#file-layout') as HTMLInputElement);
  if (!files?.length) return;
  try {
    const json = JSON.parse(await files[0].text());
    if (!Array.isArray(json.screens)) throw new Error('缺少 screens 数组');
    screens = json.screens;
    reports.clear();
    allIssues = [];
    refreshScreenList();
    updateStatus();
  } catch (e) {
    alert(`布局文件解析失败:${(e as Error).message}`);
  }
});

$('#btn-load-table').addEventListener('click', async () => {
  const files = await pickFile($('#file-table') as HTMLInputElement);
  if (!files?.length) return;
  loadTable(await files[0].text());
});

$('#btn-load-fonts').addEventListener('click', async () => {
  const files = await pickFile($('#file-fonts') as HTMLInputElement);
  if (!files?.length) return;
  for (const f of Array.from(files)) {
    try {
      const name = await fonts.loadFont(f);
      console.log(`字体已加载:${name}`);
    } catch (e) {
      alert(`字体 ${f.name} 加载失败:${(e as Error).message}`);
    }
  }
  updateStatus();
});

function loadTable(csv: string) {
  table = parseTextTable(csv);
  activeLangs = [...table.langs];
  buildLangCheckboxes();
  updateStatus();
}

function buildLangCheckboxes() {
  ui.langList.innerHTML = '';
  for (const lang of table.langs) {
    const label = document.createElement('label');
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = true;
    cb.addEventListener('change', () => {
      activeLangs = table.langs.filter((_, i) =>
        (ui.langList.children[i].querySelector('input') as HTMLInputElement).checked);
    });
    label.append(cb, ` ${lang}${fonts.configFor(lang).rtl ? ' (RTL)' : ''}`);
    ui.langList.appendChild(label);
  }
}

// ---------- 演示 / 压测 ----------
$('#btn-demo').addEventListener('click', () => {
  screens = demoLayout().screens;
  loadTable(DEMO_CSV);
  reports.clear();
  allIssues = [];
  refreshScreenList();
  updateStatus();
  runAll();
});

$('#btn-stress').addEventListener('click', () => {
  screens = stressLayout(3000).screens;
  if (!table.langs.length) loadTable(DEMO_CSV);
  reports.clear();
  allIssues = [];
  refreshScreenList();
  updateStatus();
  runAll();
});

// ---------- 运行 ----------
async function runAll() {
  if (!screens.length || !activeLangs.length) return;
  const o = opts();
  const env: CheckEnv = {
    fonts, measurer, table,
    vars: readVars(),
    leading: o.leading,
    iconRatio: o.iconRatio,
  };
  ui.progressWrap.hidden = false;
  ui.runBtn.disabled = true;
  const t0 = performance.now();
  reports = await runChecks(screens, activeLangs, env, (p) => {
    ui.progress.value = (p.done / p.total) * 100;
    ui.progressText.textContent = `${p.done}/${p.total} · ${(p.elapsedMs / 1000).toFixed(1)}s`;
  });
  lastRunMs = performance.now() - t0;
  ui.runBtn.disabled = false;
  ui.exportBtn.disabled = false;

  allIssues = [...reports.values()].flatMap((r) => r.issues);
  ui.issueCount.textContent = `(${allIssues.length})`;
  refreshScreenList();
  refreshIssueTable();
  updateStatus();
  if (!selectedScreenId && screens.length) selectScreen(screens[0].id);
  else if (selectedScreenId) renderSelected();
}

$('#btn-run').addEventListener('click', runAll);

// ---------- 界面列表 ----------
function refreshScreenList() {
  const filter = ui.screenFilter.value.trim().toLowerCase();
  ui.screenCount.textContent = `(${screens.length})`;
  ui.screenList.innerHTML = '';
  const issueCountByScreen = new Map<string, number>();
  for (const iss of allIssues) {
    issueCountByScreen.set(iss.screenId, (issueCountByScreen.get(iss.screenId) ?? 0) + 1);
  }
  const frag = document.createDocumentFragment();
  for (const s of screens) {
    if (filter && !s.name.toLowerCase().includes(filter) && !s.id.toLowerCase().includes(filter)) continue;
    const li = document.createElement('li');
    li.dataset.id = s.id;
    if (s.id === selectedScreenId) li.classList.add('selected');
    const name = document.createElement('span');
    name.textContent = s.name;
    li.appendChild(name);
    const n = issueCountByScreen.get(s.id) ?? 0;
    if (n) {
      const badge = document.createElement('b');
      badge.className = 'badge';
      badge.textContent = String(n);
      li.appendChild(badge);
    }
    li.addEventListener('click', () => selectScreen(s.id));
    frag.appendChild(li);
  }
  ui.screenList.appendChild(frag);
}

ui.screenFilter.addEventListener('input', refreshScreenList);

function selectScreen(id: string) {
  selectedScreenId = id;
  focusWidgetId = undefined;
  ui.screenList.querySelectorAll('li').forEach((li) =>
    li.classList.toggle('selected', (li as HTMLElement).dataset.id === id));
  renderSelected();
}

// ---------- 并排渲染 ----------
function renderSelected() {
  ui.canvasGrid.innerHTML = '';
  if (!selectedScreenId || !reports.size) return;
  const o = opts();
  for (const lang of activeLangs) {
    const report = reports.get(`${selectedScreenId}::${lang}`);
    if (!report) continue;
    const fig = document.createElement('figure');
    const cap = document.createElement('figcaption');
    const n = report.issues.length;
    cap.innerHTML = `<b>${lang}</b>${fonts.configFor(lang).rtl ? ' · RTL' : ''}` +
      (n ? ` <b class="badge">${n}</b>` : ' <span class="ok">✓</span>');
    const canvas = document.createElement('canvas');
    renderScreen(canvas, report, report.issues, { fonts, ...o, focusWidgetId });
    fig.append(cap, canvas);
    ui.canvasGrid.appendChild(fig);
  }
}

$('#opt-boxes').addEventListener('change', renderSelected);

// ---------- 问题表 ----------
const TYPE_NAME: Record<string, string> = {
  'overflow-x': '横向溢出',
  'overflow-y': '纵向溢出',
  overlap: '控件交叠',
  'missing-glyph': '缺字形',
  'missing-key': '缺翻译',
};

function refreshIssueTable() {
  const typeFilter = ui.issueFilter.value;
  ui.issueBody.innerHTML = '';
  const frag = document.createDocumentFragment();
  for (const iss of allIssues) {
    if (typeFilter && iss.type !== typeFilter) continue;
    const tr = document.createElement('tr');
    tr.className = `t-${iss.type}`;
    const cells = [
      iss.screenName, iss.lang, iss.widgetId,
      TYPE_NAME[iss.type] ?? iss.type,
      iss.row > 0 ? String(iss.row) : '—',
      iss.message,
    ];
    for (const c of cells) {
      const td = document.createElement('td');
      td.textContent = c;
      tr.appendChild(td);
    }
    tr.title = iss.textKey ? `key: ${iss.textKey}` : '';
    tr.addEventListener('click', () => {
      focusWidgetId = iss.widgetId;
      if (iss.screenId !== selectedScreenId) selectScreen(iss.screenId);
      else renderSelected();
    });
    frag.appendChild(tr);
  }
  ui.issueBody.appendChild(frag);
}

ui.issueFilter.addEventListener('change', refreshIssueTable);

// ---------- 导出 ----------
$('#btn-export').addEventListener('click', () => {
  const head = 'screen,lang,widget,type,text_key,csv_row,message,measured_w,measured_h,box_w,box_h';
  const q = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const lines = allIssues.map((i) => [
    q(i.screenName), i.lang, q(i.widgetId), i.type, i.textKey ?? '', i.row,
    q(i.message), i.measured?.w.toFixed(1) ?? '', i.measured?.h.toFixed(1) ?? '',
    i.box?.w ?? '', i.box?.h ?? '',
  ].join(','));
  const blob = new Blob(['﻿' + head + '\n' + lines.join('\n')], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'l10n-overflow-report.csv';
  a.click();
  URL.revokeObjectURL(a.href);
});

updateStatus();
