import { describe, expect, it } from 'vitest';
import { getBaseDirection, splitBidiRuns } from '../src/core/bidi';

describe('bidi 基方向判定', () => {
  it('拉丁/中日韩文本为 LTR', () => {
    expect(getBaseDirection('Hello world')).toBe('ltr');
    expect(getBaseDirection('限时特惠')).toBe('ltr');
    expect(getBaseDirection('ไทยไทย')).toBe('ltr');
    expect(getBaseDirection('हिन्दी')).toBe('ltr');
  });

  it('阿拉伯语/希伯来语为 RTL', () => {
    expect(getBaseDirection('السعر')).toBe('rtl');
    expect(getBaseDirection('מחיר')).toBe('rtl');
  });

  it('首强字符规则：开头数字/标点不影响判定', () => {
    expect(getBaseDirection('123 السعر')).toBe('rtl');
    expect(getBaseDirection('123 coins')).toBe('ltr');
    expect(getBaseDirection('...!!!')).toBe('ltr');
  });

  it('阿语句子中的欧洲数字切成 LTR run', () => {
    const text = 'السعر 1230 ريال';
    const runs = splitBidiRuns(text, 'rtl');
    const numRun = runs.find((r) => text.slice(r.start, r.end).includes('1230'));
    expect(numRun?.direction).toBe('ltr');
    // 阿语主体 run 是 rtl
    expect(runs[0].direction).toBe('rtl');
  });

  it('纯拉丁文本整段为单个 LTR run', () => {
    const runs = splitBidiRuns('Buy Now', 'ltr');
    expect(runs).toHaveLength(1);
    expect(runs[0].direction).toBe('ltr');
    expect(runs[0].end - runs[0].start).toBe('Buy Now'.length);
  });

  it('代理对字符不被拆散（emoji 长度计算）', () => {
    const runs = splitBidiRuns('😀😀 أبجد', 'rtl');
    // 不抛异常且覆盖全部字节
    const covered = runs.reduce((s, r) => s + (r.end - r.start), 0);
    expect(covered).toBe('😀😀 أبجد'.length);
  });
});
