import type { LangConfig } from './types';

/** 各语言默认回退栈(Windows 系统字体兜底;导入游戏字体后会插到最前) */
const DEFAULT_STACKS: Record<string, string[]> = {
  en: ['Segoe UI', 'sans-serif'],
  de: ['Segoe UI', 'sans-serif'],
  fr: ['Segoe UI', 'sans-serif'],
  es: ['Segoe UI', 'sans-serif'],
  ja: ['Yu Gothic', 'Meiryo', 'sans-serif'],
  ko: ['Malgun Gothic', 'sans-serif'],
  zh: ['Microsoft YaHei', 'sans-serif'],
  'zh-tw': ['Microsoft JhengHei', 'sans-serif'],
  th: ['Leelawadee UI', 'Tahoma', 'sans-serif'],
  hi: ['Nirmala UI', 'sans-serif'],
  ar: ['Segoe UI', 'Tahoma', 'sans-serif'],
  ru: ['Segoe UI', 'sans-serif'],
};

const RTL_LANGS = new Set(['ar', 'he', 'fa', 'ur']);
const GENERIC = new Set(['sans-serif', 'serif', 'monospace', 'cursive', 'fantasy', 'system-ui']);

export class FontManager {
  /** 用户导入的游戏字体,按导入顺序 */
  readonly loadedFonts: string[] = [];
  private langConfigs = new Map<string, LangConfig>();

  /** 从字体文件加载并注册(FontFace),返回注册名 */
  async loadFont(file: File): Promise<string> {
    const family = `game-${file.name.replace(/\.[^.]+$/, '').replace(/[^\w-]/g, '_')}`;
    const face = new FontFace(family, await file.arrayBuffer());
    await face.load();
    document.fonts.add(face);
    this.loadedFonts.push(family);
    this.langConfigs.clear(); // 栈变了,重建
    return family;
  }

  configFor(lang: string): LangConfig {
    let cfg = this.langConfigs.get(lang);
    if (!cfg) {
      const base = DEFAULT_STACKS[lang] ?? DEFAULT_STACKS[lang.split('-')[0]] ?? DEFAULT_STACKS.en;
      cfg = {
        code: lang,
        rtl: RTL_LANGS.has(lang),
        // 游戏主字体优先,其后是该语言系统回退
        fontStack: [...this.loadedFonts, ...base],
      };
      this.langConfigs.set(lang, cfg);
    }
    return cfg;
  }

  /** CSS font shorthand 的 family 部分 */
  stackCSS(lang: string, logicalFamily?: string): string {
    const stack = [...this.configFor(lang).fontStack];
    if (logicalFamily && this.loadedFonts.includes(logicalFamily)) {
      stack.unshift(logicalFamily);
    }
    return stack.map((f) => (f.includes(' ') ? `"${f}"` : f)).join(', ');
  }

  private glyphCache = new Map<string, boolean>();

  /**
   * 缺字形检测:逐具体字体(跳过 generic)用 document.fonts.check。
   * 栈里全是 generic 时无法判断,视为不缺。
   */
  missingGlyphs(lang: string, text: string): string[] {
    const concrete = this.configFor(lang).fontStack.filter((f) => !GENERIC.has(f));
    if (!concrete.length) return [];
    const missing = new Set<string>();
    for (const ch of new Set(text)) {
      if (/\s/.test(ch)) continue;
      const covered = concrete.some((fam) => {
        const ck = `${fam}${ch}`;
        let ok = this.glyphCache.get(ck);
        if (ok === undefined) {
          try {
            ok = document.fonts.check(`16px "${fam}"`, ch);
          } catch {
            ok = true; // 查询失败不误报
          }
          this.glyphCache.set(ck, ok);
        }
        return ok;
      });
      if (!covered) missing.add(ch);
    }
    return [...missing];
  }
}
