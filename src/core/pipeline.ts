/**
 * 排版流水线：项目数据 + 测量器 → 每屏每语言每档案的排版结果与问题。
 * 纯逻辑模块；Worker/主线程各自提供 TextMeasurer 与进度回调。
 */
import { detectScreen } from './detector';
import { layoutText, type LayoutInput } from './layout';
import { resolveScreen, type ResolvedControl } from './layoutResolver';
import type { TextMeasurer } from './measurer';
import type {
  BatchReport,
  ControlDef,
  Issue,
  LanguageDef,
  ProjectData,
  ScreenDef,
  TextComponentStyle,
  TextLayoutResult,
  TextTableEntry,
} from './types';

export interface PipelineOptions {
  onProgress?: (done: number, total: number, screenName: string) => void;
}

export class Pipeline {
  private tableIndex: Map<string, TextTableEntry>;

  constructor(
    private data: ProjectData,
    private measurerFactory: (language: LanguageDef) => TextMeasurer,
  ) {
    this.tableIndex = new Map();
    for (const table of data.tables) {
      for (const e of table.entries) this.tableIndex.set(e.key, e);
    }
  }

  private lookupText(control: ControlDef): { template: string; source: LayoutInput['source'] } {
    if (control.literalText !== undefined) {
      return {
        template: control.literalText,
        source: { file: '(literal)', row: -1, key: control.id },
      };
    }
    const key = control.textKey;
    if (!key) return { template: '', source: { file: '(none)', row: -1, key: control.id } };
    const entry = this.tableIndex.get(key);
    if (!entry) {
      return { template: '', source: { file: '(missing)', row: -1, key } };
    }
    return {
      template: '',
      source: { file: entry.sourceFile, row: entry.row, key },
    };
  }

  private resolveStyle(control: ControlDef): TextComponentStyle {
    const base = this.data.baseStyles;
    const s = control.style ?? {};
    return {
      fontFamily: s.fontFamily ?? base.fontFamily,
      fontSize: s.fontSize ?? base.fontSize,
      fontWeight: s.fontWeight ?? base.fontWeight,
      italic: s.italic ?? base.italic,
      color: s.color ?? base.color,
      lineHeight: s.lineHeight ?? base.lineHeight,
      letterSpacing: s.letterSpacing ?? base.letterSpacing,
      align: s.align ?? base.align,
      padding: s.padding ?? base.padding,
      overflow: s.overflow ?? base.overflow,
      maxLines: s.maxLines ?? base.maxLines,
      verticalAlign: s.verticalAlign ?? base.verticalAlign,
    };
  }

  run(job: { screenIds: string[]; languageCodes: string[]; profileIds: string[] }, opts: PipelineOptions = {}): BatchReport {
    const screens = this.data.screens.filter((s) => job.screenIds.includes(s.id));
    const languages = this.data.languages.filter((l) => job.languageCodes.includes(l.code));
    const profiles = this.data.profiles.filter((p) => job.profileIds.includes(p.id));
    const profileList = profiles.length > 0 ? profiles : [undefined];

    const allIssues: Issue[] = [];
    const allLayouts: TextLayoutResult[] = [];
    const perLanguage: Record<string, number> = {};
    const total = screens.length * languages.length * profileList.length;
    let done = 0;
    const startedAt = now();

    for (const screen of screens) {
      const resolved = resolveScreen(screen);
      const textControls = collectTextControls(screen);

      for (const language of languages) {
        const measurer = this.measurerFactory(language);
        perLanguage[language.code] ??= 0;

        for (const profile of profileList) {
          const layouts: TextLayoutResult[] = [];
          for (const control of textControls) {
            const rc = resolved.get(control.id);
            if (!rc) continue;
            const looked = this.lookupText(control);
            const template = looked.template || this.templateFor(control, language);
            if (!template) continue;

            const input: LayoutInput = {
              screenId: screen.id,
              control,
              resolvedStyle: this.resolveStyle(control),
              controlRect: rc.absoluteRect,
              template,
              language,
              profile: profile ?? undefined,
              icons: this.data.icons,
              source: looked.source,
            };
            const result = layoutText(input, measurer);
            layouts.push(result);
            allLayouts.push(result);
            perLanguage[language.code]++;
          }

          const issues = detectScreen(screen, layouts, resolved);
          allIssues.push(...issues);

          done++;
          opts.onProgress?.(done, total, screen.name);
        }
      }
    }

    return {
      issues: allIssues,
      layouts: allLayouts,
      totalLayouts: allLayouts.length,
      elapsedMs: now() - startedAt,
      perLanguage,
    };
  }

  /** 从文本表按语言列取模板（lookupText 只定位行，这里取具体语言值）。 */
  private templateFor(control: ControlDef, language: LanguageDef): string {
    if (control.literalText !== undefined) return control.literalText;
    const key = control.textKey;
    if (!key) return '';
    const entry = this.tableIndex.get(key);
    if (!entry) return '';
    return entry.values[language.tableColumn] ?? entry.values[language.code] ?? '';
  }
}

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

export function collectTextControls(screen: ScreenDef): ControlDef[] {
  const out: ControlDef[] = [];
  const walk = (controls: ControlDef[]): void => {
    for (const c of controls) {
      if (c.type !== 'image' && c.type !== 'container' && (c.textKey || c.literalText !== undefined)) {
        out.push(c);
      }
      if (c.children) walk(c.children);
    }
  };
  walk(screen.controls);
  return out;
}

export type { ResolvedControl };
