import { describe, expect, it } from 'vitest';
import {
  bidiRuns,
  defaultDirectionForLang,
  graphemeClusters,
  isBreakOpportunity,
  paragraphDirection,
  visualRuns,
} from '../src/text/bidi';

describe('Bidi 方向判断', () => {
  it('阿拉伯语段落基方向为 rtl', () => {
    expect(paragraphDirection('مرحبا')).toBe('rtl');
    expect(defaultDirectionForLang('ar')).toBe('rtl');
    expect(defaultDirectionForLang('de')).toBe('ltr');
  });

  it('英语段落为 ltr，含数字不改变基方向', () => {
    expect(paragraphDirection('Level 99 reached')).toBe('ltr');
  });

  it('混合方向文本切分为同向 run', () => {
    const runs = bidiRuns('abc مرحبا 123', 'ltr');
    expect(runs.length).toBeGreaterThanOrEqual(3);
    expect(runs.some((r) => r.dir === 'rtl')).toBe(true);
  });

  it('RTL 段落的视觉顺序为逻辑 run 的反序', () => {
    const vis = visualRuns('مرحبا', 'rtl');
    const logical = bidiRuns('مرحبا', 'rtl');
    expect(vis[0].text).toBe(logical[logical.length - 1].text);
  });
});

describe('字素簇切分', () => {
  it('组合记号不拆字（泰文声调/元音附着）', () => {
    const clusters = graphemeClusters('สวัสดี');
    // ส | ว+ั | ส | ด+ี → 4 簇（6 码点），两个组合符号均附着在前辅音上
    expect(clusters.length).toBe(4);
    expect(clusters[1].text).toBe('วั');
    expect(clusters[3].text).toBe('ดี');
  });

  it('天城文组合附着不拆字', () => {
    const clusters = graphemeClusters('हिन्दी');
    // ह + ि + न + ् + ध + ी → 簇数少于码点数
    expect(clusters.length).toBeLessThan([...'हिन्दी'].length);
  });

  it('ZWJ 连接的 Emoji 零宽连接序列保持成簇', () => {
    // 普通字母间的裸 ZWJ 不构成标准字素连接；真实 Emoji ZWJ 序列必须成簇
    const clusters = graphemeClusters('🏳️‍🌈');
    expect(clusters.length).toBe(1);
  });

  it('Emoji 修饰符与 ZWJ 序列不拆', () => {
    const clusters = graphemeClusters('👨‍👩‍👧');
    expect(clusters.length).toBe(1);
  });
});

describe('断行机会', () => {
  it('空格之后可断，行首不可断', () => {
    const text = 'hello world';
    expect(isBreakOpportunity(text, 0)).toBe(false);
    expect(isBreakOpportunity(text, 6)).toBe(true);
  });

  it('泰文辅音簇边界提供断行机会，声调附着簇不可断', () => {
    const text = 'สวัสดี';
    const clusters = graphemeClusters(text);
    // 第二个辅音簇起点
    expect(isBreakOpportunity(text, clusters[1].start)).toBe(true);
  });
});
