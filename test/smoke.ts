// 逻辑冒烟测试:不依赖浏览器,用等宽近似代替 canvas 测量。
// 运行:npx esbuild test/smoke.ts --bundle --format=esm --outfile=test/smoke.mjs && node test/smoke.mjs
import { parseTextTable } from '../src/table';
import { parseRichText, substituteVars } from '../src/richtext';
import { layoutRuns } from '../src/layout';
import { checkScreen, type CheckEnv } from '../src/checker';
import { runChecks } from '../src/runner';
import { DEMO_CSV, demoLayout, stressLayout } from '../src/demo';
import type { Measurer } from '../src/measure';
import type { FontManager } from '../src/fonts';

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) { failures++; console.error(`✗ ${msg}`); }
  else console.log(`✓ ${msg}`);
}

// 等宽近似测量器:拉丁/泰/印地/阿语 0.55em,CJK 1em
const fakeMeasurer = {
  measureText(text: string, size: number) {
    let w = 0;
    for (const ch of text) {
      w += (/[⺀-鿿豈-﫿＀-￯　-〿]/.test(ch) ? 1 : 0.55) * size;
    }
    return w;
  },
} as unknown as Measurer;

const fakeFonts = {
  configFor: (lang: string) => ({ code: lang, rtl: lang === 'ar', fontStack: ['TestFont'] }),
  stackCSS: () => 'TestFont',
  missingGlyphs: () => [],
  loadedFonts: [],
} as unknown as FontManager;

// --- 文本表解析 ---
const table = parseTextTable(DEMO_CSV);
assert(table.langs.length === 8, `文本表 8 语言(实际 ${table.langs.length})`);
assert(table.entries.size === 19, `19 个 key(实际 ${table.entries.size})`);
const play = table.entries.get('menu.play')!;
assert(play.row === 2, `menu.play 在第 2 行(实际 ${play.row})`);
assert(play.texts.de === 'Spielen', '德语译文正确');
assert(play.texts.ar === 'العب', '阿语译文正确');

// --- 富文本 ---
const runs = parseRichText('<color=#FFD700>屠龙之剑</color> <icon=gold/> x{count}', true);
assert(runs.some((r) => r.kind === 'icon' && r.icon === 'gold'), '富文本解析出图标占位');
assert(runs[0].color === '#FFD700', '富文本颜色标签生效');
assert(substituteVars('a {player} b {count}', { player: 'P', count: '9' }) === 'a P b 9', '变量代入');

// --- 断行与溢出 ---
const env: CheckEnv = {
  fonts: fakeFonts, measurer: fakeMeasurer, table,
  vars: { player: 'WidePlayerName', count: '9,999,999' },
  leading: 1.25, iconRatio: 1,
};

// 德语 Einstellungen 在 110px 按钮里:13 字符 × 18 × 0.55 ≈ 129 > 110
const r1 = layoutRuns([{ kind: 'text', text: 'Einstellungen' }], {
  lang: 'de', rtl: false, availW: 110, availH: 40, baseSize: 18,
  stackCSS: 'TestFont', wrap: false, maxLines: 0, ellipsis: false, leading: 1.25, iconRatio: 1,
}, fakeMeasurer);
assert(r1.contentW > 110, `德语单词超宽被测出(${r1.contentW.toFixed(0)}px > 110px)`);

// wrap + maxLines + ellipsis(框压窄,确保 3 行装不下)
const longText = 'Töte den Drachen und kehre vor dem Morgengrauen zum Dorfältesten zurück.';
const r2 = layoutRuns([{ kind: 'text', text: longText }], {
  lang: 'de', rtl: false, availW: 180, availH: 1000, baseSize: 16,
  stackCSS: 'TestFont', wrap: true, maxLines: 3, ellipsis: true, leading: 1.25, iconRatio: 1,
}, fakeMeasurer);
assert(r2.lines.length === 3 && r2.truncated, `长文截断到 3 行(实际 ${r2.lines.length} 行,truncated=${r2.truncated})`);
const lastLine = r2.lines[2];
assert(lastLine.runs.some((r) => r.text === '…'), '截断行带省略号');
assert(lastLine.width <= 180.5, `省略号行不超宽(${lastLine.width.toFixed(0)}px)`);

// RTL 行内 run 顺序反转
const r3 = layoutRuns([{ kind: 'text', text: 'مرحبا' }, { kind: 'text', text: ' بالعالم' }], {
  lang: 'ar', rtl: true, availW: 500, availH: 50, baseSize: 16,
  stackCSS: 'TestFont', wrap: false, maxLines: 0, ellipsis: false, leading: 1.25, iconRatio: 1,
}, fakeMeasurer);
assert(r3.lines[0].runs[0].text === 'بالعالم', 'RTL 行内 run 视觉顺序反转');

// --- 整屏检查 ---
const layout = demoLayout();
const menu = layout.screens.find((s) => s.id === 'main_menu')!;
const repDe = checkScreen(menu, 'de', env);
const repEn = checkScreen(menu, 'en', env);
const deOverflow = repDe.issues.filter((i) => i.type === 'overflow-x');
assert(deOverflow.length >= 1, `德语主菜单检出横向溢出(${deOverflow.length} 处)`);
assert(repEn.issues.filter((i) => i.type === 'overflow-x').length === 0, '英语主菜单无横向溢出');
assert(deOverflow[0].row > 0, `问题定位到文本表行(第 ${deOverflow[0].row} 行)`);

const profile = layout.screens.find((s) => s.id === 'profile')!;
const repProfile = checkScreen(profile, 'de', env);
assert(repProfile.issues.some((i) => i.type === 'overlap'), '德语个人资料检出控件交叠');

const repAr = checkScreen(menu, 'ar', env);
assert(repAr.layouts.some((l) => l.result), '阿语界面正常排版(RTL)');

// --- 压测:3000 界面 × 8 语言 ---
const stress = stressLayout(3000);
const t0 = performance.now();
runChecks(stress.screens, table.langs, env).then((reports) => {
  const ms = performance.now() - t0;
  const issueTotal = [...reports.values()].flatMap((r) => r.issues).length;
  assert(reports.size === 24000, `24000 份报告(实际 ${reports.size})`);
  console.log(`  3000×8 逻辑层耗时 ${(ms / 1000).toFixed(2)}s,检出 ${issueTotal} 个问题(等宽近似,不含真实字体 shaping)`);
  console.log(failures ? `\n${failures} 项失败` : '\n全部通过');
  process.exit(failures ? 1 : 0);
});
