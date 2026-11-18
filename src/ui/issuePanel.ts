/**
 * 右侧问题列表面板：按控件分组展示，点击问题联动 Canvas 高亮，
 * 每条问题都带文本表文件名 + 行号 + key 的精确定位。
 */
import { store } from './store';
import type { AppState, IssueFilter } from './store';
import type { Issue } from '../core/types';

const TYPE_LABEL: Record<Issue['type'], string> = {
  'overflow-x': '水平超框',
  'overflow-y': '垂直超框',
  truncated: '省略截断',
  clipped: '硬裁剪',
  overlap: '控件压盖',
  'missing-glyph': '字体缺字',
  'font-fallback': '字体回退',
};

export class IssuePanel {
  constructor(private host: HTMLElement) {}

  render(state: AppState): void {
    const issues = store.issuesForScreen(state.selectedScreenId);
    const allForScreen = state.report?.issues.filter((i) => i.screenId === state.selectedScreenId) ?? [];

    const counts = { error: 0, warning: 0, info: 0 };
    for (const i of allForScreen) counts[i.severity]++;

    const filters: { id: IssueFilter; label: string; count: number }[] = [
      { id: 'all', label: '全部', count: allForScreen.length },
      { id: 'error', label: '错误', count: counts.error },
      { id: 'warning', label: '警告', count: counts.warning },
      { id: 'info', label: '信息', count: counts.info },
    ];

    this.host.innerHTML = `
      <div class="section-title">问题筛选</div>
      <div class="filter-row">
        ${filters
          .map(
            (f) =>
              `<button data-filter="${f.id}" class="${state.filter === f.id ? 'active' : ''}">${f.label} ${f.count}</button>`,
          )
          .join('')}
      </div>
      <div class="section-title">问题列表（${issues.length}）</div>
      ${
        issues.length === 0
          ? '<div class="empty-hint">当前筛选下没有问题。</div>'
          : issues.map((i) => this.itemHtml(i, state)).join('')
      }`;

    this.host.querySelectorAll<HTMLButtonElement>('[data-filter]').forEach((btn) => {
      btn.addEventListener('click', () => store.setFilter(btn.dataset.filter as IssueFilter));
    });
    this.host.querySelectorAll<HTMLElement>('[data-issue]').forEach((el) => {
      el.addEventListener('click', () => store.setHighlight(el.dataset.issue));
    });
  }

  private itemHtml(issue: Issue, state: AppState): string {
    const lang = state.project.languages.find((l) => l.code === issue.language);
    const rowText =
      issue.source.row > 0 ? `${issue.source.file}:${issue.source.row}` : issue.source.file;
    return `
      <div class="issue-item ${state.highlightIssueId === issue.id ? 'active' : ''}" data-issue="${issue.id}">
        <div class="issue-head">
          <span class="issue-type ${issue.type}">${TYPE_LABEL[issue.type]}</span>
          <span class="badge ${issue.severity}">${issue.severity}</span>
        </div>
        <div class="issue-meta">${lang?.label ?? issue.language} · 控件 ${issue.controlId}${issue.profileId !== 'none' ? ` · ${issue.profileId}` : ''}</div>
        <div class="issue-meta">${issue.message}</div>
        <div class="issue-source">${rowText} · key=${issue.source.key}</div>
      </div>`;
  }
}
