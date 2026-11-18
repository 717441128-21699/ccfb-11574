/**
 * SFNT 字体解析：提取 cmap 字形覆盖、head/maxp 元信息。
 * 支持 TTF/OTF（裸 SFNT）与 WOFF（zlib 解包表目录）。
 * WOFF2（Brotli 变换）不支持，调用方应给出明确错误提示。
 *
 * 覆盖区间以排序数组存储，二分查找，避免 CJK 字体展开几十万码点。
 */
import type { FontCoverage } from './types';

const WOFF_SIGNATURE = 0x774f4646; // 'wOFF'
const SFNT_TAGS = new Set([0x00010000, 0x4f54544f, 0x74727565, 0x74797031]);

interface TableRecord {
  tag: string;
  offset: number;
  length: number;
  compressionLength?: number;
}

class Coverage implements FontCoverage {
  ranges: number[];
  format: number;
  numGlyphs: number;

  constructor(ranges: number[], format: number, numGlyphs: number) {
    // 合并重叠/相邻区间
    ranges.sort((a, b) => a - b);
    const merged: number[] = [];
    for (let i = 0; i < ranges.length; i += 2) {
      const s = ranges[i];
      const e = ranges[i + 1];
      if (merged.length && s <= merged[merged.length - 1] + 1) {
        if (e > merged[merged.length - 1]) merged[merged.length - 1] = e;
      } else {
        merged.push(s, e);
      }
    }
    this.ranges = merged;
    this.format = format;
    this.numGlyphs = numGlyphs;
  }

  covers(codepoint: number): boolean {
    const r = this.ranges;
    let lo = 0;
    let hi = (r.length >>> 1) - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >>> 1;
      const s = r[mid * 2];
      const e = r[mid * 2 + 1];
      if (codepoint < s) hi = mid - 1;
      else if (codepoint > e) lo = mid + 1;
      else return true;
    }
    return false;
  }
}

function readTag(view: DataView, offset: number): string {
  let s = '';
  for (let i = 0; i < 4; i++) s += String.fromCharCode(view.getUint8(offset + i));
  return s;
}

/** 解析表目录；WOFF 时解压被压缩的表，返回解压后视图。 */
async function readTableDirectory(
  view: DataView,
): Promise<{ tables: Map<string, TableRecord>; view: DataView; flavor: number }> {
  const signature = view.getUint32(0);
  const tables = new Map<string, TableRecord>();

  if (SFNT_TAGS.has(signature)) {
    const numTables = view.getUint16(4);
    let p = 12;
    for (let i = 0; i < numTables; i++) {
      const tag = readTag(view, p);
      const offset = view.getUint32(p + 8);
      const length = view.getUint32(p + 12);
      tables.set(tag, { tag, offset, length });
      p += 16;
    }
    return { tables, view, flavor: signature };
  }

  if (signature === WOFF_SIGNATURE) {
    const numTables = view.getUint16(12);
    let p = 44;
    for (let i = 0; i < numTables; i++) {
      const tag = readTag(view, p);
      const offset = view.getUint32(p + 4);
      const compressionLength = view.getUint32(p + 8);
      const length = view.getUint32(p + 12);
      tables.set(tag, { tag, offset, length, compressionLength });
      p += 20;
    }
    // 按解压顺序重铺到一块连续缓冲，重写表偏移
    const rebuilt = new Map<string, TableRecord>();
    const chunks: Uint8Array[] = [];
    let cursor = 0;
    for (const [tag, rec] of tables) {
      let data: Uint8Array;
      if (rec.compressionLength !== undefined && rec.compressionLength !== rec.length) {
        const compressed = new Uint8Array(view.buffer, view.byteOffset + rec.offset, rec.compressionLength);
        data = new Uint8Array(await inflate(compressed));
      } else {
        data = new Uint8Array(view.buffer, view.byteOffset + rec.offset, rec.length);
      }
      chunks.push(data);
      rebuilt.set(tag, { tag, offset: cursor, length: rec.length });
      cursor += data.length;
    }
    const flat = new Uint8Array(cursor);
    let off = 0;
    for (const c of chunks) {
      flat.set(c, off);
      off += c.length;
    }
    return { tables: rebuilt, view: new DataView(flat.buffer), flavor: signature };
  }

  if (signature === 0x774f4632) {
    // 'wOF2'
    throw new Error('WOFF2 字体使用 Brotli 变换，当前版本不支持；请转换为 TTF/OTF/WOFF 后导入。');
  }

  throw new Error('无法识别的字体文件格式（既不是 SFNT 也不是 WOFF）。');
}

async function inflate(compressed: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('当前环境不支持 DecompressionStream，无法解压 WOFF 字体；请改用 TTF/OTF。');
  }
  const ds = new DecompressionStream('deflate');
  const copy = new Uint8Array(compressed.byteLength);
  copy.set(compressed);
  const stream = new Blob([copy.buffer]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** 解析 cmap format 4（BMP）。 */
function parseFormat4(view: DataView, start: number): { ranges: number[]; format: number } {
  const segCountX2 = view.getUint16(start + 6);
  const segCount = segCountX2 >> 1;
  const endCodes = start + 14;
  const startCodes = endCodes + segCountX2 + 2; // 跳过 reservedPad
  const idDeltas = startCodes + segCountX2;
  const idRangeOffsets = idDeltas + segCountX2;
  const ranges: number[] = [];

  for (let i = 0; i < segCount; i++) {
    const end = view.getUint16(endCodes + i * 2);
    const begin = view.getUint16(startCodes + i * 2);
    if (begin === 0xffff && end === 0xffff) continue;
    // 只收集“映射到非 0 字形”的码点区间。
    // 严谨判定需查 glyphId（delta/offset），这里抽样验证首末与中点，
    // 全量展开 BMP 区间代价小，逐码点算 glyphId。
    for (let cp = begin; cp <= end; cp++) {
      const glyphId = lookupFormat4Glyph(view, cp, i, startCodes, idDeltas, idRangeOffsets);
      if (glyphId !== 0) pushRange(ranges, cp);
    }
  }
  return { ranges, format: 4 };
}

function lookupFormat4Glyph(
  view: DataView,
  cp: number,
  segmentIndex: number,
  startCodes: number,
  idDeltas: number,
  idRangeOffsets: number,
): number {
  const rangeOffset = view.getUint16(idRangeOffsets + segmentIndex * 2);
  if (rangeOffset === 0) {
    return (cp + view.getInt16(idDeltas + segmentIndex * 2)) & 0xffff;
  }
  const glyphAddr =
    idRangeOffsets + segmentIndex * 2 + rangeOffset + (cp - view.getUint16(startCodes + segmentIndex * 2)) * 2;
  if (glyphAddr + 2 > view.buffer.byteLength) return 0;
  const glyphId = view.getUint16(glyphAddr);
  if (glyphId === 0) return 0;
  return (glyphId + view.getInt16(idDeltas + segmentIndex * 2)) & 0xffff;
}

/** 解析 cmap format 12（完整 Unicode，含增补平面）。 */
function parseFormat12(view: DataView, start: number): { ranges: number[]; format: number } {
  const numGroups = view.getUint32(start + 12);
  const ranges: number[] = [];
  let p = start + 16;
  for (let i = 0; i < numGroups; i++) {
    const startCharCode = view.getUint32(p);
    const endCharCode = view.getUint32(p + 4);
    const startGlyphCode = view.getUint32(p + 8);
    p += 12;
    // startGlyphCode === 0 时整段是 .notdef，跳过
    if (startGlyphCode !== 0) ranges.push(startCharCode, endCharCode);
  }
  return { ranges, format: 12 };
}

function pushRange(ranges: number[], cp: number): void {
  if (ranges.length && cp === ranges[ranges.length - 1] + 1) {
    ranges[ranges.length - 1] = cp;
  } else {
    ranges.push(cp, cp);
  }
}

function parseCmap(view: DataView, cmapRecord: TableRecord): { ranges: number[]; format: number } {
  const base = cmapRecord.offset;
  const numTables = view.getUint16(base + 2);
  // 优先级：(3,10) > (0,6) > (3,1) > (0,4) > (0,3)
  const preference = [
    (p: number, e: number) => p === 3 && e === 10,
    (p: number, e: number) => p === 0 && e === 6,
    (p: number, e: number) => p === 3 && e === 1,
    (p: number, e: number) => p === 0 && e === 4,
    (p: number, e: number) => p === 0 && e === 3,
  ];
  let chosen: { platformID: number; encodingID: number; offset: number } | undefined;
  const subs: { platformID: number; encodingID: number; offset: number }[] = [];
  let p = base + 4;
  for (let i = 0; i < numTables; i++) {
    const platformID = view.getUint16(p);
    const encodingID = view.getUint16(p + 2);
    const offset = view.getUint32(p + 4);
    subs.push({ platformID, encodingID, offset });
    p += 8;
  }
  for (const pred of preference) {
    chosen = subs.find((s) => pred(s.platformID, s.encodingID));
    if (chosen) break;
  }
  chosen ??= subs[0];
  if (!chosen) throw new Error('字体 cmap 表为空。');

  const subtableStart = base + chosen.offset;
  const format = view.getUint16(subtableStart);
  if (format === 4) return parseFormat4(view, subtableStart);
  if (format === 12) return parseFormat12(view, subtableStart);
  if (format === 6) {
    // format 6 少见，按连续码点处理
    const first = view.getUint16(subtableStart + 6);
    const count = view.getUint16(subtableStart + 8);
    const ranges: number[] = [];
    for (let i = 0; i < count; i++) {
      const glyphId = view.getUint16(subtableStart + 10 + i * 2);
      if (glyphId !== 0) pushRange(ranges, first + i);
    }
    return { ranges, format: 6 };
  }
  throw new Error(`暂不支持 cmap format ${format}，请使用含 format 4/12 子表的字体。`);
}

export interface ParsedFont {
  coverage: FontCoverage;
  numGlyphs: number;
  unitsPerEm: number;
}

export async function parseFont(data: ArrayBuffer): Promise<ParsedFont> {
  const rootView = new DataView(data);
  const { tables, view } = await readTableDirectory(rootView);

  const cmap = tables.get('cmap');
  if (!cmap) throw new Error('字体缺少 cmap 表。');
  const { ranges, format } = parseCmap(view, cmap);

  let numGlyphs = 0;
  const maxp = tables.get('maxp');
  if (maxp) numGlyphs = view.getUint16(maxp.offset + 4);

  let unitsPerEm = 1000;
  const head = tables.get('head');
  if (head) unitsPerEm = view.getUint16(head.offset + 18);

  return {
    coverage: new Coverage(ranges, format, numGlyphs),
    numGlyphs,
    unitsPerEm,
  };
}
