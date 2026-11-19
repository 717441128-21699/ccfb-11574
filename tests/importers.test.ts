import { describe, expect, it } from 'vitest';
import { parseCsv, importTextTables, importLayout } from '../src/io/importers';

describe('CSV 解析', () => {
  it('处理引号、转义双引号与 CRLF', () => {
    const csv = 'key,en,de\r\na,"hello, ""x""",welt\r\nb,plain,einfach\r\n';
    const { headers, rows, rowNumbers } = parseCsv(csv);
    expect(headers).toEqual(['key', 'en', 'de']);
    expect(rows[0][1]).toBe('hello, "x"');
    expect(rowNumbers[0]).toBe(2);
    expect(rowNumbers[1]).toBe(3);
  });

  it('字段内换行不拆行', () => {
    const csv = 'key,en\na,"line1\nline2"\n';
    const parsed = parseCsv(csv);
    expect(parsed.rows.length).toBe(1);
    expect(parsed.rows[0][1]).toBe('line1\nline2');
  });

  it('构建多语言文本表并保留物理行号', () => {
    const csv = 'key,en,de\nk1,hello,hallo\nk2,world,welt\n';
    const tables = importTextTables(csv, 't.csv');
    expect(tables.size).toBe(2);
    const de = tables.get('de')!;
    expect(de.entries[1]).toMatchObject({ key: 'k2', text: 'welt', row: 3 });
    expect(de.index.get('k1')).toBe(0);
  });

  it('缺少 key 列时报错', () => {
    expect(() => importTextTables('en,de\na,b\n')).toThrow(/key/);
  });
});

describe('布局 JSON 导入', () => {
  it('兼容 snake_case 与扁平坐标，补齐默认值', () => {
    const doc = importLayout(
      JSON.stringify({
        id: 's1',
        design_width: 800,
        design_height: 600,
        widgets: [
          { id: 'b1', type: 'button', x: 10, y: 20, width: 100, height: 40, text_key: 'ok', font_size: 16, overflow_mode: 'truncate' },
        ],
      }),
      's1.json',
    );
    expect(doc.designWidth).toBe(800);
    const w = doc.widgets[0];
    expect(w.rect).toEqual({ x: 10, y: 20, w: 100, h: 40 });
    expect(w.textKey).toBe('ok');
    expect(w.fontSize).toBe(16);
    expect(w.overflow).toBe('truncate');
    expect(w.maxLines).toBe(1);
  });

  it('非法枚举回退默认值，嵌套子控件递归转换', () => {
    const doc = importLayout(
      JSON.stringify({
        id: 's2',
        widgets: [{ id: 'c', type: 'container', rect: { x: 0, y: 0, w: 10, h: 10 }, children: [{ id: 't', rect: { x: 1, y: 1, w: 5, h: 5 } }] }],
      }),
    );
    const child = doc.widgets[0].children![0];
    expect(child.overflow).toBe('wrap');
    expect(child.id).toBe('t');
  });
});
