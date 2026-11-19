/**
 * 极简 sfnt（TTF/OTF/WOFF）cmap 解析器。
 *
 * 只做一件事：从字体文件里取出可渲染码点集合，用于"主字体缺字 →
 * 按回退链找替补字体"的精确判断，以及缺字问题上报。
 *
 * 支持：
 *  - 裸 TTF/OTF（sfnt 版本 0x00010000 / 'OTTO' / 'true'）
 *  - WOFF（zlib 压缩，经 DecompressionStream 解压）
 *  - cmap format 0 / 4 / 6 / 12（覆盖绝大多数字体）
 * WOFF2（Brotli）不做静态解析，回退到运行时 fonts.check 探测。
 */

const SFNT_TAGS = new Set([0x00010000, 0x4f54544f /* OTTO */, 0x74727565 /* true */, 0x74797031 /* typ1 */]);

interface TableRecord {
  tag: number;
  offset: number;
  length: number;
}

function readTableDirectory(view: DataView, tableCount: number, dirOffset: number): TableRecord[] {
  const tables: TableRecord[] = [];
  let p = dirOffset;
  for (let i = 0; i < tableCount; i += 1) {
    tables.push({
      tag: view.getUint32(p),
      offset: view.getUint32(p + 8),
      length: view.getUint32(p + 12),
    });
    p += 16;
  }
  return tables;
}

function parseCmap(view: DataView, cmapOffset: number): Set<number> {
  const numTables = view.getUint16(cmapOffset + 2);
  let bestOffset = 0;
  let bestScore = -1;
  for (let i = 0; i < numTables; i += 1) {
    const rec = cmapOffset + 4 + i * 8;
    const platform = view.getUint16(rec);
    const encoding = view.getUint16(rec + 2);
    const offset = view.getUint32(rec + 4);
    // 优先级：(3,10) 全码型 > (3,1) BMP > (0,*) Unicode > 其他
    let score: number;
    if (platform === 3 && encoding === 10) score = 5;
    else if (platform === 0) score = 4;
    else if (platform === 3 && encoding === 1) score = 3;
    else if (platform === 3 && encoding === 0) score = 2;
    else score = 1;
    if (score > bestScore) {
      bestScore = score;
      bestOffset = offset;
    }
  }
  const base = cmapOffset + bestOffset;
  const format = view.getUint16(base);
  switch (format) {
    case 0:
      return parseFormat0(view, base);
    case 4:
      return parseFormat4(view, base);
    case 6:
      return parseFormat6(view, base);
    case 12:
      return parseFormat12(view, base);
    default:
      return new Set();
  }
}

function parseFormat0(view: DataView, base: number): Set<number> {
  const out = new Set<number>();
  for (let i = 0; i < 256; i += 1) {
    const g = view.getUint8(base + 6 + i);
    if (g !== 0) out.add(i);
  }
  return out;
}

function parseFormat4(view: DataView, base: number): Set<number> {
  const out = new Set<number>();
  const segX2 = view.getUint16(base + 6);
  const segCount = segX2 / 2;
  const endCodes = base + 14;
  const startCodes = endCodes + segX2 + 2;
  const idDeltas = startCodes + segX2;
  const idRangeOffsets = idDeltas + segX2;
  for (let s = 0; s < segCount; s += 1) {
    const end = view.getUint16(endCodes + s * 2);
    const start = view.getUint16(startCodes + s * 2);
    const delta = view.getInt16(idDeltas + s * 2);
    const rangeOffset = view.getUint16(idRangeOffsets + s * 2);
    for (let cp = start; cp <= end; cp += 1) {
      if (cp === 0xffff) continue;
      let glyph: number;
      if (rangeOffset === 0) {
        glyph = (cp + delta) & 0xffff;
      } else {
        const addr = idRangeOffsets + s * 2 + rangeOffset + (cp - start) * 2;
        if (addr + 2 > view.byteLength) continue;
        glyph = view.getUint16(addr);
        if (glyph !== 0) glyph = (glyph + delta) & 0xffff;
      }
      if (glyph !== 0) out.add(cp);
    }
  }
  return out;
}

function parseFormat6(view: DataView, base: number): Set<number> {
  const out = new Set<number>();
  const first = view.getUint16(base + 6);
  const count = view.getUint16(base + 8);
  for (let i = 0; i < count; i += 1) {
    const g = view.getUint16(base + 10 + i * 2);
    if (g !== 0) out.add(first + i);
  }
  return out;
}

function parseFormat12(view: DataView, base: number): Set<number> {
  const out = new Set<number>();
  const groups = view.getUint32(base + 12);
  let p = base + 16;
  for (let g = 0; g < groups; g += 1) {
    const start = view.getUint32(p);
    const end = view.getUint32(p + 4);
    const startGlyph = view.getUint32(p + 8);
    if (startGlyph !== 0) {
      for (let cp = start; cp <= end; cp += 1) out.add(cp);
    }
    p += 12;
  }
  return out;
}

async function inflateZlib(buf: ArrayBuffer): Promise<ArrayBuffer> {
  const ds = new DecompressionStream('deflate');
  const stream = new Blob([buf]).stream().pipeThrough(ds);
  return new Response(stream).arrayBuffer();
}

/**
 * 解析字体二进制，返回 cmap 覆盖码点集合。
 * 无法解析（WOFF2/未知格式/损坏文件）时返回 null，调用方改用运行时探测。
 */
export async function extractCoverage(data: ArrayBuffer): Promise<Set<number> | null> {
  let view = new DataView(data);
  if (data.byteLength < 12) return null;
  const signature = view.getUint32(0);

  if (signature === 0x774f4646 /* wOFF */) {
    // WOFF 表目录：每条 20 字节 = tag(4) offset(4) compLen(4) origLen(4) checksum(4)
    const tableCount = view.getUint16(12);
    interface WoffRec {
      offset: number;
      compLen: number;
      origLen: number;
    }
    let cmapRec: WoffRec | null = null;
    for (let i = 0; i < tableCount; i += 1) {
      const p = 44 + i * 20;
      const tag = view.getUint32(p);
      if (tag === 0x636d6170 /* cmap */) {
        cmapRec = {
          offset: view.getUint32(p + 4),
          compLen: view.getUint32(p + 8),
          origLen: view.getUint32(p + 12),
        };
        break;
      }
    }
    if (!cmapRec) return null;
    const raw = data.slice(cmapRec.offset, cmapRec.offset + cmapRec.compLen);
    // 单表解压后即 cmap 数据本身，表内偏移从 0 开始
    const cmapBuf = cmapRec.compLen === cmapRec.origLen ? raw : await inflateZlib(raw);
    try {
      return parseCmap(new DataView(cmapBuf), 0);
    } catch {
      return null;
    }
  }

  if (signature === 0x774f4632 /* wOF2 */) return null;
  if (!SFNT_TAGS.has(signature)) return null;

  try {
    const tableCount = view.getUint16(4);
    const dir = readTableDirectory(view, tableCount, 12);
    const cmapRec = dir.find((t) => t.tag === 0x636d6170);
    if (!cmapRec) return null;
    return parseCmap(view, cmapRec.offset);
  } catch {
    return null;
  }
}
