/**
 * 导入器：界面布局 JSON、文本表（JSON / CSV）、字体二进制。
 * 解析失败时抛出带文件名与行号信息的错误，便于 UI 展示。
 */
import { parseFont } from './fontCmap';
import type {
  ControlDef,
  FontDef,
  LanguageDef,
  ScreenDef,
  TextTable,
  TextTableEntry,
} from './types';

// ---------- 布局 ----------

export function parseScreens(json: unknown, sourceName = 'screens.json'): ScreenDef[] {
  if (!Array.isArray(json)) {
    throw new Error(`${sourceName}：根节点应为界面数组`);
  }
  return json.map((raw, i) => parseScreen(raw, `${sourceName}#${i}`));
}

function parseScreen(raw: Record<string, unknown>, path: string): ScreenDef {
  if (typeof raw.id !== 'string' || typeof raw.name !== 'string') {
    throw new Error(`${path}：缺少 id / name 字段`);
  }
  const size = raw.canvasSize as { width?: number; height?: number } | undefined;
  if (!size || typeof size.width !== 'number' || typeof size.height !== 'number') {
    throw new Error(`${path}：canvasSize 必须含数值型 width/height`);
  }
  const controls = Array.isArray(raw.controls)
    ? (raw.controls as Record<string, unknown>[]).map((c, i) => parseControl(c, `${path}.controls[${i}]`))
    : [];
  return { id: raw.id, name: raw.name, canvasSize: { width: size.width, height: size.height }, controls };
}

function parseControl(raw: Record<string, unknown>, path: string): ControlDef {
  const rect = raw.rect as ControlDef['rect'] | undefined;
  if (
    !rect ||
    ['x', 'y', 'width', 'height'].some((k) => typeof (rect as unknown as Record<string, unknown>)[k] !== 'number')
  ) {
    throw new Error(`${path}：rect 必须含数值型 x/y/width/height`);
  }
  const control: ControlDef = {
    id: String(raw.id ?? ''),
    type: (raw.type as ControlDef['type']) ?? 'label',
    rect,
    textKey: raw.textKey as string | undefined,
    literalText: raw.literalText as string | undefined,
    style: raw.style as ControlDef['style'],
    textFrameInset: raw.textFrameInset as number | undefined,
    anchors: raw.anchors as ControlDef['anchors'],
  };
  if (!control.id) throw new Error(`${path}：控件缺少 id`);
  if (raw.children && Array.isArray(raw.children)) {
    control.children = (raw.children as Record<string, unknown>[]).map((c, i) =>
      parseControl(c, `${path}.children[${i}]`),
    );
  }
  return control;
}

// ---------- 文本表 ----------

/**
 * JSON 形态：[{ key: "btn_ok", zh: "...", en: "..." }, ...]
 * 或 { entries: [...] }。
 */
export function parseTextTableJson(json: unknown, sourceName: string, columns: string[]): TextTable {
  const arr = Array.isArray(json)
    ? json
    : (json as { entries?: unknown[] } | null)?.entries;
  if (!Array.isArray(arr)) throw new Error(`${sourceName}：应为对象数组或 { entries: [...] }`);

  const entries: TextTableEntry[] = arr.map((raw, i) => {
    const obj = raw as Record<string, unknown>;
    if (typeof obj.key !== 'string') throw new Error(`${sourceName} 第 ${i + 2} 行：缺少 key`);
    const values: Record<string, string> = {};
    for (const col of columns) {
      const v = obj[col];
      if (v !== undefined && v !== null) values[col] = String(v);
    }
    return { key: obj.key, values, row: i + 2, sourceFile: sourceName };
  });
  return { sourceFile: sourceName, entries };
}

/**
 * CSV 形态：首行表头 key,zh,en,de,...；支持引号包裹、转义双引号、CRLF。
 */
export function parseTextTableCsv(text: string, sourceName: string, columns: string[]): TextTable {
  const rows = parseCsv(text);
  if (rows.length === 0) throw new Error(`${sourceName}：空 CSV`);
  const header = rows[0].map((h) => h.trim());
  const keyIdx = header.findIndex((h) => h === 'key' || h === 'id');
  if (keyIdx === -1) throw new Error(`${sourceName}：表头缺少 key 列`);
  const colIdx = columns.map((c) => header.indexOf(c));

  const entries: TextTableEntry[] = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (row.length === 1 && row[0].trim() === '') continue;
    const key = row[keyIdx];
    if (!key) continue;
    const values: Record<string, string> = {};
    colIdx.forEach((idx, i) => {
      if (idx !== -1 && row[idx] !== undefined) values[columns[i]] = row[idx];
    });
    entries.push({ key, values, row: r + 1, sourceFile: sourceName });
  }
  return { sourceFile: sourceName, entries };
}

/** 最小 RFC 4180 兼容解析器。 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

// ---------- 字体 ----------

export async function importFont(
  family: string,
  weight: number,
  style: 'normal' | 'italic',
  data: ArrayBuffer,
  sourceName: string,
  isSystem = false,
): Promise<FontDef> {
  if (isSystem) {
    return { family, weight, style, isSystem: true, sourceName };
  }
  const parsed = await parseFont(data);
  return {
    family,
    weight,
    style,
    data,
    sourceName,
    coverage: parsed.coverage,
  };
}

// ---------- 语言 ----------

/** 内置八种语言定义；fontStack 为系统字体回退（演示用），项目可覆盖。 */
export function defaultLanguages(): LanguageDef[] {
  return [
    { code: 'zh-CN', label: '简体中文', tableColumn: 'zh', fontStack: ['Microsoft YaHei', 'PingFang SC', 'sans-serif'], wordBreak: 'space' },
    { code: 'en-US', label: 'English', tableColumn: 'en', fontStack: ['Arial', 'sans-serif'], wordBreak: 'space' },
    {
      code: 'de-DE',
      label: 'Deutsch',
      tableColumn: 'de',
      fontStack: ['Arial', 'sans-serif'],
      wordBreak: 'space',
    },
    {
      code: 'ja-JP',
      label: '日本語',
      tableColumn: 'ja',
      fontStack: ['Yu Gothic', 'Hiragino Sans', 'sans-serif'],
      wordBreak: 'space',
    },
    {
      code: 'ko-KR',
      label: '한국어',
      tableColumn: 'ko',
      fontStack: ['Malgun Gothic', 'sans-serif'],
      wordBreak: 'space',
    },
    {
      code: 'th-TH',
      label: 'ไทย',
      tableColumn: 'th',
      fontStack: ['Leelawadee UI', 'Tahoma', 'sans-serif'],
      wordBreak: 'segmenter',
    },
    {
      code: 'hi-IN',
      label: 'हिन्दी',
      tableColumn: 'hi',
      fontStack: ['Nirmala UI', 'Mangal', 'sans-serif'],
      wordBreak: 'segmenter',
    },
    {
      code: 'ar-SA',
      label: 'العربية',
      tableColumn: 'ar',
      fontStack: ['Segoe UI', 'Tahoma', 'sans-serif'],
      forceDirection: 'rtl',
      wordBreak: 'space',
    },
  ];
}
