import type { TextEntry, TextTable } from './types';

/**
 * 解析文本表 CSV/TSV。首行表头:key,en,de,…
 * 支持引号包裹、内嵌逗号/换行。row 为含表头的 1 起行号(多行单元格按起始行)。
 */
export function parseTextTable(content: string): TextTable {
  const rows: { cells: string[]; row: number }[] = [];
  let cells: string[] = [];
  let cell = '';
  let inQuotes = false;
  let line = 1;
  let rowStart = 1;

  const pushRow = () => {
    cells.push(cell);
    cell = '';
    if (cells.some((c) => c.trim() !== '')) rows.push({ cells, row: rowStart });
    cells = [];
    rowStart = line;
  };

  for (let i = 0; i < content.length; i++) {
    const ch = content[i];
    if (inQuotes) {
      if (ch === '"') {
        if (content[i + 1] === '"') { cell += '"'; i++; }
        else inQuotes = false;
      } else {
        if (ch === '\n') line++;
        cell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',' || ch === '\t') {
      cells.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && content[i + 1] === '\n') i++;
      line++;
      pushRow();
    } else {
      cell += ch;
    }
  }
  pushRow();

  if (!rows.length) return { langs: [], entries: new Map() };
  const header = rows[0].cells.map((h) => h.trim());
  const langs = header.slice(1).filter(Boolean);
  const entries = new Map<string, TextEntry>();
  for (const r of rows.slice(1)) {
    const key = r.cells[0]?.trim();
    if (!key) continue;
    const texts: Record<string, string> = {};
    langs.forEach((lang, i) => {
      const v = r.cells[i + 1];
      if (v !== undefined && v !== '') texts[lang] = v;
    });
    entries.set(key, { key, row: r.row, texts });
  }
  return { langs, entries };
}
