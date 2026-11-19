/**
 * 布局与文本表导入器。
 *
 * 布局：JSON（本工具 schema，见 LayoutDocument）。字段命名贴近常见
 * UI 编辑器导出格式，提供 snake_case → camelCase 兼容映射。
 *
 * 文本表：CSV（首行表头 key,en,de,fr,es,ru,ar,th,hi,zh,ja），
 * 支持引号转义、"" 转义、CRLF；保留每条词条在文件中的物理行号，
 * 检测结果直接回链该行。
 */
import type {
  HAlign,
  LangCode,
  LayoutDocument,
  OverflowMode,
  TextEntry,
  TextTable,
  VAlign,
  Widget,
} from '../types';

const LANG_CODES: LangCode[] = ['en', 'de', 'fr', 'es', 'ru', 'ar', 'th', 'hi', 'zh', 'ja'];

export function isLangCode(v: string): v is LangCode {
  return (LANG_CODES as string[]).includes(v);
}

/* ------------------------------ CSV ------------------------------ */

export interface ParsedCsv {
  headers: string[];
  rows: string[][];
  /** 每个数据行在原文件中的 1 基行号 */
  rowNumbers: number[];
}

/** RFC 4180 风格 CSV 解析（支持引号、双引号转义、换行） */
export function parseCsv(text: string): ParsedCsv {
  const rows: string[][] = [];
  const rowNumbers: number[] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;
  let lineNo = 1;
  let rowStartedAt = 1;

  const pushField = () => {
    row.push(field);
    field = '';
  };
  const pushRow = () => {
    pushField();
    if (row.length > 1 || row[0] !== '') {
      rows.push(row);
      rowNumbers.push(rowStartedAt);
    }
    row = [];
  };

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
        if (ch === '\n') lineNo++;
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      pushField();
    } else if (ch === '\r') {
      if (text[i + 1] === '\n') i++;
      lineNo++;
      pushRow();
      // lineNo 已指向新行，即下一数据行的物理行号
      rowStartedAt = lineNo;
    } else if (ch === '\n') {
      lineNo++;
      pushRow();
      rowStartedAt = lineNo;
    } else {
      field += ch;
    }  }
  if (field.length || row.length) pushRow();

  const headers = rows.shift() ?? [];
  const headerLine = rowNumbers.shift();
  void headerLine;
  return { headers: headers.map((h) => h.trim()), rows, rowNumbers };
}

/** 从一份 CSV 构建全部语言的文本表 */
export function importTextTables(csvText: string, source?: string): Map<LangCode, TextTable> {
  const { headers, rows, rowNumbers } = parseCsv(csvText);
  const keyCol = headers.findIndex((h) => h.toLowerCase() === 'key');
  if (keyCol === -1) throw new Error('CSV 表头缺少 key 列');
  const langCols = new Map<LangCode, number>();
  headers.forEach((h, idx) => {
    const code = h.trim().toLowerCase();
    if (isLangCode(code)) langCols.set(code, idx);
  });
  if (!langCols.size) throw new Error('CSV 表头未识别到任何语言列（en/de/fr/es/ru/ar/th/hi/zh/ja）');

  const tables = new Map<LangCode, TextTable>();
  for (const [lang, col] of langCols) {
    const entries: TextEntry[] = [];
    const index = new Map<string, number>();
    rows.forEach((cells, rIdx) => {
      const key = cells[keyCol]?.trim();
      if (!key) return;
      const text = cells[col] ?? '';
      const row = rowNumbers[rIdx] ?? rIdx + 2;
      index.set(key, entries.length);
      entries.push({ key, text, row, source });
    });
    tables.set(lang, { lang, entries, index });
  }
  return tables;
}

/* ---------------------------- Layout JSON ---------------------------- */

interface RawWidget {
  id?: string;
  type?: string;
  rect?: { x?: number; y?: number; w?: number; h?: number; width?: number; height?: number };
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  width?: number;
  height?: number;
  textKey?: string;
  text_key?: string;
  key?: string;
  inlineText?: string;
  text?: string;
  fontSize?: number;
  font_size?: number;
  fontFamily?: string;
  font_family?: string;
  lineHeight?: number;
  line_height?: number;
  bold?: boolean;
  italic?: boolean;
  color?: string;
  hAlign?: string;
  halign?: string;
  align?: string;
  vAlign?: string;
  valign?: string;
  overflow?: string;
  overflow_mode?: string;
  maxLines?: number;
  max_lines?: number;
  letterSpacing?: number;
  letter_spacing?: number;
  padding?: number | { left?: number; right?: number; top?: number; bottom?: number };
  rtlMirror?: boolean;
  rtl_mirror?: boolean;
  children?: RawWidget[];
  widgets?: RawWidget[];
}

const OVERFLOW_MODES: OverflowMode[] = ['wrap', 'truncate', 'shrink', 'overflow'];
const HALIGNS: HAlign[] = ['left', 'center', 'right'];
const VALIGNES: VAlign[] = ['top', 'middle', 'bottom'];

export function importLayout(jsonText: string, source?: string): LayoutDocument {
  const raw = JSON.parse(jsonText) as {
    id?: string;
    name?: string;
    designWidth?: number;
    design_width?: number;
    designHeight?: number;
    design_height?: number;
    rtl?: boolean;
    widgets?: RawWidget[];
    screens?: RawWidget[];
  };
  const widgets = (raw.widgets ?? raw.screens ?? []).map((w, i) => convertWidget(w, i));
  return {
    id: raw.id ?? source ?? `layout-${Date.now()}`,
    name: raw.name ?? raw.id ?? '未命名界面',
    designWidth: raw.designWidth ?? raw.design_width ?? 1280,
    designHeight: raw.designHeight ?? raw.design_height ?? 720,
    rtl: raw.rtl,
    widgets,
    source,
  };
}

function convertWidget(raw: RawWidget, index: number): Widget {
  const rect = {
    x: raw.rect?.x ?? raw.x ?? 0,
    y: raw.rect?.y ?? raw.y ?? 0,
    w: raw.rect?.w ?? raw.rect?.width ?? raw.w ?? raw.width ?? 100,
    h: raw.rect?.h ?? raw.rect?.height ?? raw.h ?? raw.height ?? 40,
  };
  const type = (raw.type ?? 'text') as Widget['type'];
  const overflow = normalizeEnum(raw.overflow ?? raw.overflow_mode, OVERFLOW_MODES, 'wrap');
  const hAlign = normalizeEnum(raw.hAlign ?? raw.halign ?? raw.align, HALIGNS, 'left');
  const vAlign = normalizeEnum(raw.vAlign ?? raw.valign, VALIGNES, 'middle');
  const padding = normalizePadding(raw.padding);
  return {
    id: raw.id ?? `${type}_${index}`,
    type,
    rect,
    textKey: raw.textKey ?? raw.text_key ?? raw.key,
    inlineText: raw.inlineText ?? raw.text,
    fontSize: raw.fontSize ?? raw.font_size ?? 18,
    fontFamily: raw.fontFamily ?? raw.font_family ?? 'GameUI',
    lineHeight: raw.lineHeight ?? raw.line_height ?? Math.round((raw.fontSize ?? raw.font_size ?? 18) * 1.25),
    bold: raw.bold,
    italic: raw.italic,
    color: raw.color,
    hAlign,
    vAlign,
    overflow,
    maxLines: raw.maxLines ?? raw.max_lines ?? (overflow === 'wrap' ? 3 : 1),
    letterSpacing: raw.letterSpacing ?? raw.letter_spacing,
    padding,
    rtlMirror: raw.rtlMirror ?? raw.rtl_mirror ?? true,
    children: (raw.children ?? raw.widgets)?.map((c, i) => convertWidget(c, i)),
  };
}

function normalizeEnum<T extends string>(v: string | undefined, allowed: T[], fallback: T): T {
  return v && (allowed as string[]).includes(v) ? (v as T) : fallback;
}

function normalizePadding(p: RawWidget['padding']): Widget['padding'] {
  if (typeof p === 'number') return { left: p, right: p, top: p, bottom: p };
  return {
    left: p?.left ?? 8,
    right: p?.right ?? 8,
    top: p?.top ?? 4,
    bottom: p?.bottom ?? 4,
  };
}

/** 批量导入多个布局文件 */
export function importLayouts(files: { name: string; text: string }[]): LayoutDocument[] {
  return files.map((f) => importLayout(f.text, f.name));
}
