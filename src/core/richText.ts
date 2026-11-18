/**
 * 富文本解析。支持游戏里常见的标签子集：
 *   <color=#RRGGBB>…</color>   颜色（也支持颜色名，见 NAMED_COLORS）
 *   <b>…</b> / <i>…</i>        粗体/斜体
 *   <size=22>…</size>          字号覆盖
 *   <icon=coin/>               图标占位（自闭合，宽度计入排版）
 * 未闭合标签按文本字面量处理；嵌套以栈方式生效。
 */
import type { RichSegment, RichToken } from './types';

const NAMED_COLORS: Record<string, string> = {
  red: '#ff4444',
  green: '#44dd66',
  blue: '#4488ff',
  yellow: '#ffcc33',
  white: '#ffffff',
  black: '#000000',
  gray: '#999999',
  grey: '#999999',
  orange: '#ff8833',
  purple: '#aa66ff',
};

const TAG_RE = /<\/?[a-zA-Z]+(?:\s*=\s*[^>\s]+)?\s*\/?>/g;

export function tokenize(input: string): RichToken[] {
  const tokens: RichToken[] = [];
  let last = 0;
  TAG_RE.lastIndex = 0;
  for (const m of input.matchAll(TAG_RE)) {
    const idx = m.index;
    if (idx > last) tokens.push({ type: 'text', value: input.slice(last, idx), rawLength: idx - last, offset: last });
    const raw = m[0];
    const inner = raw.slice(1, -1).trim();
    const closing = inner.startsWith('/');
    const selfClose = inner.endsWith('/');
    const body = closing ? inner.slice(1).trim() : inner.replace(/\/$/, '').trim();
    const eq = body.indexOf('=');
    const name = (eq === -1 ? body : body.slice(0, eq)).trim().toLowerCase();
    const param = eq === -1 ? undefined : body.slice(eq + 1).trim();
    tokens.push({
      type: 'tag',
      value: closing ? `/${name}` : selfClose ? name : name,
      tagParam: param,
      rawLength: raw.length,
      offset: idx,
    });
    last = idx + raw.length;
  }
  if (last < input.length) {
    tokens.push({ type: 'text', value: input.slice(last), rawLength: input.length - last, offset: last });
  }
  return tokens;
}

export interface ActiveStyle {
  color: string;
  bold: boolean;
  italic: boolean;
  sizeOverride?: number;
}

export interface SegmentBuildOptions {
  baseFontFamily: string;
  baseFontSize: number;
  baseFontWeight: number;
  baseItalic: boolean;
  baseColor: string;
  icons: Record<string, { width: number; height: number }>;
}

/** 把 token 流展开为带样式的段（图标段独立，宽度参与排版）。 */
export function buildSegments(input: string, opts: SegmentBuildOptions): RichSegment[] {
  const tokens = tokenize(input);
  const segments: RichSegment[] = [];
  const stack: ActiveStyle[] = [
    { color: opts.baseColor, bold: false, italic: false, sizeOverride: undefined },
  ];

  const pushText = (text: string, offset: number): void => {
    if (!text) return;
    const top = stack[stack.length - 1];
    segments.push({
      kind: 'text',
      content: text,
      fontFamily: opts.baseFontFamily,
      fontSize: top.sizeOverride ?? opts.baseFontSize,
      fontWeight: top.bold ? 700 : opts.baseFontWeight,
      italic: top.italic || opts.baseItalic,
      color: top.color,
      sourceOffset: offset,
      sourceLength: text.length,
    });
  };

  let cursor = 0;
  for (const tok of tokens) {
    if (tok.type === 'text') {
      pushText(tok.value, tok.offset);
      cursor = tok.offset + tok.rawLength;
      continue;
    }
    const top = stack[stack.length - 1];
    if (tok.value === 'color' && tok.tagParam) {
      stack.push({ ...top, color: resolveColor(tok.tagParam) });
    } else if (tok.value === 'b') {
      stack.push({ ...top, bold: true });
    } else if (tok.value === 'i') {
      stack.push({ ...top, italic: true });
    } else if (tok.value === 'size' && tok.tagParam) {
      const size = Number.parseFloat(tok.tagParam);
      stack.push({ ...top, sizeOverride: Number.isFinite(size) ? size : top.sizeOverride });
    } else if (tok.value === '/color' || tok.value === '/b' || tok.value === '/i' || tok.value === '/size') {
      if (stack.length > 1) stack.pop();
    } else if (tok.value === 'icon' && tok.tagParam) {
      const icon = opts.icons[tok.tagParam];
      segments.push({
        kind: 'icon',
        content: tok.tagParam,
        fontFamily: opts.baseFontFamily,
        fontSize: opts.baseFontSize,
        fontWeight: opts.baseFontWeight,
        italic: false,
        color: top.color,
        sourceOffset: tok.offset,
        sourceLength: tok.rawLength,
        iconWidth: icon?.width ?? opts.baseFontSize,
        iconHeight: icon?.height ?? opts.baseFontSize,
      });
    }
    cursor = tok.offset + tok.rawLength;
  }
  void cursor;
  return segments;
}

function resolveColor(raw: string): string {
  const v = raw.trim().toLowerCase();
  if (v.startsWith('#')) return v;
  return NAMED_COLORS[v] ?? v;
}

/** 去掉所有标签后的纯文本（用于 bidi 判定与变量校验提示）。 */
export function stripTags(input: string): string {
  return input.replace(TAG_RE, '');
}
