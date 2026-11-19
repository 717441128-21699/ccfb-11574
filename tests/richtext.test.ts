import { describe, expect, it } from 'vitest';
import { parseRichText } from '../src/text/richtext';
import { extractVariables, substituteVariables } from '../src/text/variables';

describe('富文本解析', () => {
  it('解析颜色标签并继承到闭合前的 run', () => {
    const { runs, plain } = parseRichText('a <color=#ff0000>red</color> b');
    expect(plain).toBe('a red b');
    const red = runs.find((r) => r.text === 'red');
    expect(red?.color).toBe('#ff0000');
  });

  it('支持颜色名、b/i 嵌套与 size', () => {
    const { runs } = parseRichText('<b>bold <i>both</i></b>');
    expect(runs[0].bold).toBe(true);
    expect(runs.find((r) => r.text.includes('both'))?.italic).toBe(true);
  });

  it('图标标签输出 U+FFFC 占位并携带尺寸', () => {
    const { runs, plain } = parseRichText('coin <icon name="coin" w=18 h=20/> x');
    const iconRun = runs.find((r) => r.icon);
    expect(iconRun?.icon).toEqual({ name: 'coin', w: 18, h: 20 });
    expect(plain).toContain('￼');
  });

  it('转义尖括号输出字面量', () => {
    const { plain } = parseRichText('a \\< b \\>');
    expect(plain).toBe('a < b >');
  });

  it('非法与未闭合标签产生警告但不抛错', () => {
    const ok = parseRichText('<color>x');
    expect(ok.warnings.length).toBeGreaterThan(0);
    const bad = parseRichText('</b> x');
    expect(bad.warnings.length).toBeGreaterThan(0);
  });
});

describe('变量替换', () => {
  it('替换全部占位并提取变量名', () => {
    const tpl = '{playerName} has {count} gold';
    expect(extractVariables(tpl)).toEqual(['playerName', 'count']);
    const out = substituteVariables(tpl, 'de');
    expect(out).not.toContain('{');
    expect(out).toContain('999.999.999'); // 德语千分位用点
  });

  it('阿拉伯语数字使用阿拉伯-印度数字', () => {
    const out = substituteVariables('{count}', 'ar');
    expect(out).toMatch(/[٠-٩]/);
  });

  it('自定义 WorstCaseVars 覆盖内置值', () => {
    const out = substituteVariables('{playerName}', 'en', {
      values: { playerName: { en: 'X' } },
    });
    expect(out).toBe('X');
  });

  it('未配置的数字类变量仍给大数字，文本类变量给长名字兜底', () => {
    expect(substituteVariables('{damage}', 'en')).toContain('999');
    expect(substituteVariables('{guild}', 'en').length).toBeGreaterThan(10);
  });
});
