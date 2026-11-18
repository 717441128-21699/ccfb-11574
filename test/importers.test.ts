import { describe, expect, it } from 'vitest';
import { parseCsv, parseTextTableCsv, parseScreens } from '../src/core/importers';

describe('CSV 解析', () => {
  it('基础逗号与 CRLF', () => {
    const rows = parseCsv('key,en,de\r\nk1,hello,hallo\r\n');
    expect(rows).toEqual([
      ['key', 'en', 'de'],
      ['k1', 'hello', 'hallo'],
    ]);
  });

  it('引号包裹逗号与转义双引号', () => {
    const rows = parseCsv('key,text\nk1,"a,b""c"');
    expect(rows[1][1]).toBe('a,b"c');
  });

  it('文本表映射语言列并保留行号', () => {
    const csv = 'key,en,de\nbtn,Buy,Jetzt\n';
    const table = parseTextTableCsv(csv, 'ui.csv', ['en', 'de']);
    expect(table.entries[0].values.de).toBe('Jetzt');
    expect(table.entries[0].row).toBe(2);
    expect(table.entries[0].sourceFile).toBe('ui.csv');
  });

  it('缺列容错：未提供的语言列不报错', () => {
    const table = parseTextTableCsv('key,en\nk,a\n', 'ui.csv', ['en', 'ar']);
    expect(table.entries[0].values.en).toBe('a');
    expect(table.entries[0].values.ar).toBeUndefined();
  });
});

describe('布局 JSON 校验', () => {
  it('合法布局通过', () => {
    const screens = parseScreens([
      {
        id: 's',
        name: 'S',
        canvasSize: { width: 100, height: 100 },
        controls: [{ id: 'c', type: 'label', rect: { x: 0, y: 0, width: 50, height: 20 } }],
      },
    ]);
    expect(screens[0].controls[0].id).toBe('c');
  });

  it('rect 缺字段抛带路径错误', () => {
    expect(() =>
      parseScreens([{ id: 's', name: 'S', canvasSize: { width: 1, height: 1 }, controls: [{ id: 'c', rect: { x: 0 } }] }]),
    ).toThrow(/rect/);
  });
});
