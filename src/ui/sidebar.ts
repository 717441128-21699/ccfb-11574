/**
 * 左侧栏：界面列表、语言勾选、变量档案勾选、字体导入入口。
 */
import { store } from './store';
import type { AppState } from './store';

export class Sidebar {
  constructor(private host: HTMLElement) {}

  render(state: AppState): void {
    const screenCounts = new Map<string, number>();
    for (const issue of state.report?.issues ?? []) {
      screenCounts.set(issue.screenId, (screenCounts.get(issue.screenId) ?? 0) + 1);
    }

    this.host.innerHTML = `
      <div class="section-title">界面（${state.project.screens.length}）</div>
      ${state.project.screens
        .map(
          (s) => `
        <div class="screen-item ${s.id === state.selectedScreenId ? 'active' : ''}" data-screen="${s.id}">
          <span>${s.name}</span>
          ${screenCounts.get(s.id) ? `<span class="badge error">${screenCounts.get(s.id)}</span>` : ''}
        </div>`,
        )
        .join('')}

      <div class="section-title">语言（${state.selectedLanguages.length}/${state.project.languages.length}）</div>
      ${state.project.languages
        .map(
          (l) => `
        <label class="checkline lang-item">
          <input type="checkbox" data-lang="${l.code}" ${state.selectedLanguages.includes(l.code) ? 'checked' : ''} />
          <span>${l.label}</span>
          <code style="margin-left:auto;color:var(--text-dim)">${l.code}</code>
        </label>`,
        )
        .join('')}

      <div class="section-title">变量档案</div>
      ${state.project.profiles
        .map(
          (p) => `
        <label class="checkline profile-item">
          <input type="checkbox" data-profile="${p.id}" ${state.selectedProfileIds.includes(p.id) ? 'checked' : ''} />
          <span>${p.label}</span>
        </label>`,
        )
        .join('')}

      <div class="section-title">字体</div>
      <div class="tooltip-note">
        内嵌 TTF/OTF/WOFF 可精确判定缺字；WOFF2 不支持。<br />
        不导入时使用系统字体栈，缺字判定关闭。
      </div>
      ${
        state.project.fonts.length === 0
          ? '<div class="tooltip-note">当前：系统字体栈（演示模式）</div>'
          : state.project.fonts
              .map(
                (f) => `
            <div class="tooltip-note">
              ${f.isSystem ? '🖥' : '🔤'} ${f.family} ${f.weight}${f.style === 'italic' ? ' italic' : ''}
              ${f.coverage ? `· ${f.coverage.numGlyphs || '?'} glyphs` : ''}
            </div>`,
              )
              .join('')
      }
      <label class="file-btn" style="margin:6px">
        <input type="file" id="font-file" accept=".ttf,.otf,.woff" multiple />
        <button type="button" id="font-btn">导入内嵌字体…</button>
      </label>
      <div style="padding:0 8px">
        <input id="font-family" placeholder="字体族名，如 GameSans" style="width:100%;background:var(--panel-2);border:1px solid var(--border);color:var(--text);border-radius:6px;padding:6px 8px" />
      </div>`;

    this.host.querySelectorAll<HTMLElement>('[data-screen]').forEach((el) => {
      el.addEventListener('click', () => store.selectScreen(el.dataset.screen!));
    });
    this.host.querySelectorAll<HTMLInputElement>('[data-lang]').forEach((el) => {
      el.addEventListener('change', () => store.toggleLanguage(el.dataset.lang!));
    });
    this.host.querySelectorAll<HTMLInputElement>('[data-profile]').forEach((el) => {
      el.addEventListener('change', () => store.toggleProfile(el.dataset.profile!));
    });

    const fontBtn = this.host.querySelector<HTMLButtonElement>('#font-btn');
    const fontFile = this.host.querySelector<HTMLInputElement>('#font-file');
    const fontFamily = this.host.querySelector<HTMLInputElement>('#font-family');
    fontBtn?.addEventListener('click', () => fontFile?.click());
    fontFile?.addEventListener('change', async () => {
      if (!fontFile.files?.length) return;
      const family = fontFamily?.value.trim() || 'GameSans';
      await store.importFonts([...fontFile.files], family);
      fontFile.value = '';
    });
  }
}
