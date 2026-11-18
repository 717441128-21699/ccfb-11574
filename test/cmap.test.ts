import { describe, expect, it } from 'vitest';
import { parseFont } from '../src/core/fontCmap';

/**
 * 手工构造只含 cmap(format 4)/head/maxp 的最小 SFNT。
 * cmap 声明 BMP 区间 U+0041..0x0043（ABC）映射到非 0 字形。
 */
function buildMinimalSfnt(): ArrayBuffer {
  // format 4: 2 个段（含 0xffff 哨兵段）
  const segCount = 2;
  const segX2 = segCount * 2;
  const fmt4 = new Uint8Array(16 + segX2 * 4 + 2);
  const dv = new DataView(fmt4.buffer);
  let p = 0;
  dv.setUint16(p, 4); p += 2; // format
  dv.setUint16(p, fmt4.length); p += 2; // length
  dv.setUint16(p, 0); p += 2; // language
  dv.setUint16(p, segX2); p += 2; // segCountX2
  dv.setUint16(p, 4); p += 2; // searchRange
  dv.setUint16(p, 1); p += 2; // entrySelector
  dv.setUint16(p, 0); p += 2; // rangeShift
  // endCode
  dv.setUint16(p, 0x43); p += 2;
  dv.setUint16(p, 0xffff); p += 2;
  dv.setUint16(p, 0); p += 2; // reservedPad
  // startCode
  dv.setUint16(p, 0x41); p += 2;
  dv.setUint16(p, 0xffff); p += 2;
  // idDelta（简单 +1 映射）
  dv.setInt16(p, 1); p += 2;
  dv.setInt16(p, 1); p += 2;
  // idRangeOffset = 0
  dv.setUint16(p, 0); p += 2;
  dv.setUint16(p, 0); p += 2;

  // cmap 头：1 个子表 (platform 3, encoding 1)
  const cmap = new Uint8Array(4 + 8 + fmt4.length);
  const cv = new DataView(cmap.buffer);
  cv.setUint16(0, 0); // version
  cv.setUint16(2, 1); // numTables
  cv.setUint16(4, 3); // platformID
  cv.setUint16(6, 1); // encodingID
  cv.setUint32(8, 12); // offset
  cmap.set(fmt4, 12);

  // head（固定 54 字节），unitsPerEm 在 offset 18
  const head = new Uint8Array(54);
  new DataView(head.buffer).setUint16(18, 1000);
  // maxp（6 字节起 numGlyphs）
  const maxp = new Uint8Array(6);
  new DataView(maxp.buffer).setUint16(4, 4);

  const tables: [string, Uint8Array][] = [
    ['cmap', cmap],
    ['head', head],
    ['maxp', maxp],
  ];
  const numTables = tables.length;
  const headerSize = 12 + numTables * 16;
  let cursor = headerSize;
  const layout = tables.map(([tag, data]) => {
    const offset = cursor;
    cursor += data.length;
    return { tag, data, offset, length: data.length };
  });

  const buf = new ArrayBuffer(cursor);
  const root = new DataView(buf);
  root.setUint32(0, 0x00010000);
  root.setUint16(4, numTables);
  root.setUint16(6, 16); // searchRange
  root.setUint16(8, 0);
  root.setUint16(10, 0);
  let dir = 12;
  for (const t of layout) {
    for (let i = 0; i < 4; i++) root.setUint8(dir + i, t.tag.charCodeAt(i));
    root.setUint32(dir + 4, 0); // checksum
    root.setUint32(dir + 8, t.offset);
    root.setUint32(dir + 12, t.length);
    dir += 16;
  }
  for (const t of layout) new Uint8Array(buf).set(t.data, t.offset);
  return buf;
}

describe('SFNT/cmap 解析', () => {
  it('format 4 区间成员判定正确', async () => {
    const parsed = await parseFont(buildMinimalSfnt());
    expect(parsed.numGlyphs).toBe(4);
    expect(parsed.unitsPerEm).toBe(1000);
    expect(parsed.coverage.format).toBe(4);
    expect(parsed.coverage.covers(0x41)).toBe(true); // A
    expect(parsed.coverage.covers(0x42)).toBe(true); // B
    expect(parsed.coverage.covers(0x43)).toBe(true); // C
    expect(parsed.coverage.covers(0x40)).toBe(false);
    expect(parsed.coverage.covers(0x44)).toBe(false);
    expect(parsed.coverage.covers(0x4e2d)).toBe(false); // 中
  });

  it('WOFF2 给出明确错误', async () => {
    const woff2 = new ArrayBuffer(4);
    new DataView(woff2).setUint32(0, 0x774f4632);
    await expect(parseFont(woff2)).rejects.toThrow(/WOFF2/);
  });

  it('垃圾数据报错', async () => {
    await expect(parseFont(new ArrayBuffer(8))).rejects.toThrow();
  });
});
