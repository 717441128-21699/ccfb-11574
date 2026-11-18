import { describe, expect, it } from 'vitest';
import { Pipeline } from '../src/core/pipeline';
import { buildSampleProject } from '../src/data/sampleData';
import type { TextMeasurer } from '../src/core/measurer';
import type { LanguageDef, RichSegment, Direction } from '../src/core/types';

/** 按字符宽度近似的假测量器：ASCII 8px、其他 14px，图标取注册宽度。 */
class FakeMeasurer implements TextMeasurer {
  measure(text: string, _s: string[], seg: RichSegment, _d: Direction) {
    let width = 0;
    for (const ch of Array.from(text)) {
      width += ch.codePointAt(0)! < 0x80 ? 8 : 14;
    }
    if (seg.kind === 'icon') width = seg.iconWidth ?? 16;
    return { width, family: seg.fontFamily, families: [seg.fontFamily], missing: [] };
  }
  lineMetrics(_stack: string[], seg: RichSegment) {
    return { ascent: seg.fontSize * 0.9, descent: seg.fontSize * 0.3 };
  }
}

describe('端到端流水线（示例工程）', () => {
  const project = buildSampleProject();

  it('8 语言 × 5 界面全部产出排版结果，且阿语方向为 rtl', () => {
    const pipeline = new Pipeline(project, () => new FakeMeasurer());
    const report = pipeline.run({
      screenIds: project.screens.map((s) => s.id),
      languageCodes: project.languages.map((l) => l.code),
      profileIds: ['worst_case'],
    });

    const textControlCount = project.screens.reduce(
      (n, s) => n + s.controls.filter((c) => c.textKey || c.literalText !== undefined).length,
      0,
    );
    expect(report.totalLayouts).toBe(textControlCount * project.languages.length);
    const arabic = report.layouts.filter((l) => l.language === 'ar-SA');
    expect(arabic.length).toBeGreaterThan(0);
    expect(arabic.every((l) => l.direction === 'rtl')).toBe(true);
  });

  it('示例数据能稳定复现问题（德语长词/超长玩家名至少触发超框或截断）', () => {
    const pipeline = new Pipeline(project, () => new FakeMeasurer());
    const report = pipeline.run({
      screenIds: project.screens.map((s) => s.id),
      languageCodes: project.languages.map((l) => l.code),
      profileIds: ['worst_case'],
    });
    const types = new Set(report.issues.map((i) => i.type));
    expect(types.has('overflow-x') || types.has('truncated') || types.has('overflow-y')).toBe(true);
  });

  it('每个问题都带文本表行号定位', () => {
    const pipeline = new Pipeline(project, () => new FakeMeasurer());
    const report = pipeline.run({
      screenIds: project.screens.map((s) => s.id),
      languageCodes: ['de-DE', 'ar-SA'],
      profileIds: ['worst_case'],
    });
    for (const issue of report.issues) {
      expect(issue.source.file).toBeTruthy();
      expect(issue.source.key).toBeTruthy();
      expect(issue.source.row).not.toBe(0);
    }
  });

  it('多档案并行：常规值的问题数不多于最坏情况', () => {
    const pipeline = new Pipeline(project, () => new FakeMeasurer());
    const worst = pipeline.run({
      screenIds: project.screens.map((s) => s.id),
      languageCodes: ['en-US'],
      profileIds: ['worst_case'],
    });
    const normal = pipeline.run({
      screenIds: project.screens.map((s) => s.id),
      languageCodes: ['en-US'],
      profileIds: ['normal'],
    });
    const errCount = (r: typeof worst): number => r.issues.filter((i) => i.severity === 'error').length;
    expect(errCount(normal)).toBeLessThanOrEqual(errCount(worst));
  });

  it('语言列表可扩展：新增语言无需改内核即可排版', () => {
    const extended: LanguageDef = {
      code: 'vi-VN',
      label: 'Tiếng Việt',
      tableColumn: 'vi',
      fontStack: ['Arial'],
      wordBreak: 'space',
    };
    const p2 = {
      ...project,
      languages: [...project.languages, extended],
      tables: project.tables.map((t) => ({
        ...t,
        entries: t.entries.map((e) => ({ ...e, values: { ...e.values, vi: e.values.en ?? '' } })),
      })),
    };
    const pipeline = new Pipeline(p2, () => new FakeMeasurer());
    const report = pipeline.run({
      screenIds: [project.screens[0].id],
      languageCodes: ['vi-VN'],
      profileIds: ['worst_case'],
    });
    expect(report.layouts.every((l) => l.language === 'vi-VN')).toBe(true);
  });
});
