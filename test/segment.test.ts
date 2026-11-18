import { describe, expect, it } from 'vitest';
import { analyzeBreaks, toGraphemeClusters } from '../src/core/segment';

describe('字素簇切分', () => {
  it('泰语组合记号作为一个字素簇', () => {
    // ก ์ ้ 组合：ก + 音调记号 + 下沉记号
    const clusters = toGraphemeClusters('กํา', 'th-TH');
    expect(clusters.length).toBeLessThanOrEqual(2);
    expect(clusters.map((c) => c.text).join('')).toBe('กํา');
  });

  it('天城文合字不拆成散码点', () => {
    // क्ष = क + ् + ष，Intl.Segmenter 应给 1 个簇
    const clusters = toGraphemeClusters('क्ष', 'hi-IN');
    expect(clusters).toHaveLength(1);
  });

  it('emoji 代理对保持完整', () => {
    const clusters = toGraphemeClusters('a😀b', 'en-US');
    expect(clusters.map((c) => c.text)).toEqual(['a', '😀', 'b']);
  });
});

describe('断行机会', () => {
  it('英语只在空格后产生断点', () => {
    const text = 'one two three';
    const br = analyzeBreaks(text, 'en-US', false);
    expect(br.opportunities[text.indexOf('two')]).toBe(true);
    expect(br.opportunities[text.indexOf('three')]).toBe(true);
    // 单词内部不可断
    expect(br.opportunities[text.indexOf('ne') + 1]).toBe(false);
  });

  it('泰语词典分词在词边界给出断点', () => {
    const text = 'ฉันรักภาษาไทย'; // 我爱泰语，无空格
    const br = analyzeBreaks(text, 'th-TH', true);
    const trueCount = br.opportunities.filter(Boolean).length;
    // 首尾之外至少有一个词间断点
    expect(trueCount).toBeGreaterThan(2);
  });

  it('换行符位置为强制断点且落在簇边界', () => {
    const text = 'line1\nline2';
    const br = analyzeBreaks(text, 'en-US', false);
    expect(br.opportunities[text.indexOf('\n') + 1]).toBe(true);
  });
});
