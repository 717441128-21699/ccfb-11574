import { describe, expect, it } from 'vitest';
import { buildSegments, stripTags, tokenize } from '../src/core/richText';
import { substitute, localizeNumber } from '../src/core/variables';

const baseOpts = {
  baseFontFamily: 'GameSans',
  baseFontSize: 16,
  baseFontWeight: 400,
  baseItalic: false,
  baseColor: '#fff',
  icons: { coin: { width: 22, height: 22 } },
};

describe('富文本解析', () => {
  it('颜色标签产生独立样式段', () => {
    const segs = buildSegments('价格 <color=#ff0000>999</color> 金币', baseOpts);
    const red = segs.find((s) => s.color === '#ff0000');
    expect(red).toBeDefined();
    expect(red?.kind).toBe('text');
    expect(red?.content).toBe('999');
  });

  it('颜色名映射为十六进制', () => {
    const segs = buildSegments('<color=red>stop</color>', baseOpts);
    expect(segs[0].color).toBe('#ff4444');
  });

  it('粗体与字号标签叠加', () => {
    const segs = buildSegments('a<b>bold<size=24>big</size></b>c', baseOpts);
    const big = segs.find((s) => s.content === 'big')!;
    expect(big.fontWeight).toBe(700);
    expect(big.fontSize).toBe(24);
    const plain = segs.find((s) => s.content === 'c')!;
    expect(plain.fontWeight).toBe(400);
    expect(plain.fontSize).toBe(16);
  });

  it('图标标签生成 icon 段且宽度取注册表', () => {
    const segs = buildSegments('x<icon=coin/>y', baseOpts);
    const icon = segs.find((s) => s.kind === 'icon')!;
    expect(icon.content).toBe('coin');
    expect(icon.iconWidth).toBe(22);
  });

  it('未注册图标回退为字号见方', () => {
    const segs = buildSegments('<icon=unknown/>', baseOpts);
    expect(segs[0].iconWidth).toBe(16);
  });

  it('stripTags 去掉全部标签', () => {
    expect(stripTags('<color=#fff>a</color><b>b</b>')).toBe('ab');
    expect(stripTags('plain text')).toBe('plain text');
  });

  it('token 带正确偏移与长度', () => {
    const tokens = tokenize('a<color=#fff>b</color>');
    const tag = tokens.find((t) => t.type === 'tag')!;
    expect(tag.offset).toBe(1);
    expect(tag.rawLength).toBe('<color=#fff>'.length);
  });
});

describe('变量替换', () => {
  it('命名变量替换且保留富文本标签', () => {
    const r = substitute('<color=#f00>{name}</color>', { name: '小明' });
    expect(r.text).toBe('<color=#f00>小明</color>');
    expect(r.missing).toEqual([]);
  });

  it('缺失变量上报并保留占位', () => {
    const r = substitute('hi {who}', {});
    expect(r.text).toBe('hi {who}');
    expect(r.missing).toContain('who');
  });

  it('位置占位按顺序消费', () => {
    const r = substitute('%s 获得 %d 分', {}, ['小明', '100']);
    expect(r.text).toBe('小明 获得 100 分');
  });

  it('数字按 locale 本地化（德语小数点分隔符）', () => {
    expect(localizeNumber(1234567.8, 'de-DE')).toContain('.');
    expect(localizeNumber(1234567, 'en-US')).toBe('1,234,567');
  });
});
