import { describe, expect, it } from 'vitest';
import { extractCoverage } from '../src/text/fontCmap';

describe('sfnt cmap 解析', () => {
  it('损坏或过短的输入返回 null 而不是抛错', async () => {
    expect(await extractCoverage(new ArrayBuffer(4))).toBeNull();
    expect(await extractCoverage(new ArrayBuffer(0))).toBeNull();
  });

  it('无法识别的签名返回 null（交给运行时探测兜底）', async () => {
    const buf = new ArrayBuffer(64);
    const view = new DataView(buf);
    view.setUint32(0, 0xdeadbeef);
    expect(await extractCoverage(buf)).toBeNull();
  });

  it('WOFF2 签名不做静态解析，返回 null', async () => {
    const buf = new ArrayBuffer(64);
    const view = new DataView(buf);
    view.setUint32(0, 0x774f4632); // 'wOF2'
    expect(await extractCoverage(buf)).toBeNull();
  });

  it('合法 sfnt 但缺少 cmap 表时返回 null', async () => {
    // 构造一个只有表头、表数为 0 的最小 sfnt
    const buf = new ArrayBuffer(12);
    const view = new DataView(buf);
    view.setUint32(0, 0x00010000); // sfnt 版本
    view.setUint16(4, 0); // numTables = 0
    expect(await extractCoverage(buf)).toBeNull();
  });
});
