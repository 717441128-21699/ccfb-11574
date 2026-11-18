/**
 * 压力基准：合成 3000 个界面 × 8 语言 × 最坏档案，验证内核吞吐。
 * 运行：npm run benchmark
 *
 * 说明：Node 下使用等宽假测量器，测的是排版算法（分词/bidi/换行/检测）
 * 的纯计算开销；浏览器真实 Canvas measureText 通常更贵，
 * 但测量缓存命中率高（词表有限），UI 会显示实测吞吐与 5 分钟外推。
 */
import { Pipeline } from '../src/core/pipeline';
import { buildSampleProject } from '../src/data/sampleData';
import type { LanguageDef, ProjectData, RichSegment, ScreenDef, TextMeasurer, Direction } from '../src/core/types';

class BenchMeasurer implements TextMeasurer {
  measure(text: string, _s: string[], seg: RichSegment, _d: Direction) {
    let width = 0;
    for (const ch of Array.from(text)) width += ch.codePointAt(0)! < 0x80 ? 8 : 14;
    if (seg.kind === 'icon') width = seg.iconWidth ?? 16;
    return { width, family: seg.fontFamily, families: [seg.fontFamily], missing: [] };
  }
  lineMetrics(_s: string[], seg: RichSegment) {
    return { ascent: seg.fontSize * 0.9, descent: seg.fontSize * 0.3 };
  }
}

const SCREEN_TARGET = Number(process.argv[2] ?? 3000);
const LANG_TARGET = Number(process.argv[3] ?? 8);

function inflateScreens(base: ProjectData, target: number): ScreenDef[] {
  const template = base.screens;
  const out: ScreenDef[] = [];
  for (let i = 0; i < target; i++) {
    const t = template[i % template.length];
    out.push({
      ...t,
      id: `${t.id}_gen_${i}`,
      name: `${t.name}#${i}`,
      controls: t.controls.map((c) => ({ ...c, rect: { ...c.rect } })),
    });
  }
  return out;
}

const base = buildSampleProject();
const languages = base.languages.slice(0, LANG_TARGET) as LanguageDef[];
const project: ProjectData = {
  ...base,
  languages,
  screens: inflateScreens(base, SCREEN_TARGET),
};

const pipeline = new Pipeline(project, () => new BenchMeasurer());
const job = {
  screenIds: project.screens.map((s) => s.id),
  languageCodes: languages.map((l) => l.code),
  profileIds: ['worst_case'],
};

const t0 = performance.now();
const report = pipeline.run(job);
const elapsed = performance.now() - t0;

const textControls = project.screens.reduce(
  (n, s) => n + s.controls.filter((c) => c.textKey || c.literalText !== undefined).length,
  0,
);
const expectedLayouts = textControls * languages.length;
const throughput = Math.round(report.totalLayouts / (elapsed / 1000));
const fiveMinCapacity = throughput * 300;
const byType = new Map<string, number>();
for (const i of report.issues) byType.set(i.type, (byType.get(i.type) ?? 0) + 1);

console.log('────────────────────────────────────────────────');
console.log(`界面数        : ${SCREEN_TARGET}`);
console.log(`语言数        : ${LANG_TARGET}`);
console.log(`排版总数      : ${report.totalLayouts}（期望 ${expectedLayouts}）`);
console.log(`耗时          : ${(elapsed / 1000).toFixed(2)} s`);
console.log(`吞吐          : ${throughput.toLocaleString()} 排版/秒`);
console.log(`5 分钟容量    : ${fiveMinCapacity.toLocaleString()} 排版（目标 ${expectedLayouts}）`);
console.log(`达标          : ${elapsed <= 300_000 ? '✅ 是' : '❌ 否'}`);
console.log(`问题总数      : ${report.issues.length}`);
for (const [type, count] of [...byType.entries()].sort()) console.log(`  - ${type.padEnd(16)} ${count}`);
console.log('────────────────────────────────────────────────');

if (report.totalLayouts !== expectedLayouts) {
  console.error('排版数与期望不符，基准失败');
  process.exit(1);
}
