/**
 * 富文本解析器。
 *
 * 支持标签（与常见游戏引擎富文本语法对齐）：
 *   <color=#rrggbb>…</color>   颜色（也支持颜色名）
 *   <b>…</b> / <i>…</i>        粗体/斜体
 *   <icon name="coin" w=18 h=18/>  内联图标占位，输出 ￼（U+FFFC）
 *   <size=20>…</size>          局部字号
 *   转义：\< 与 \> 输出字面量
 *
 * 解析结果是 RichRun[]；图标占位以 U+FFFC 单字符参与测量与换行，
 * 其宽度来自标签属性（绘制阶段替换为图标矩形，不画字形）。
 */
import type { RichRun } from '../types';

const NAMED_COLORS: Record<string, string> = {
  white: '#ffffff',
  black: '#000000',
  red: '#ff0000',
  green: '#008000',
  blue: '#0000ff',
  yellow: '#ffff00',
  cyan: '#00ffff',
  magenta: '#ff00ff',
  gray: '#808080',
  grey: '#808080',
  orange: '#ffa500',
  gold: '#ffd700',
};

interface TagState {
  color?: string;
  bold?: boolean;
  italic?: boolean;
  sizeDelta?: number;
  sizeAbs?: number;
}

interface ParsedTag {
  name: string;
  closing: boolean;
  selfClosing: boolean;
  attrs: Record<string, string>;
}

function parseTag(raw: string): ParsedTag | null {
  let body = raw.slice(1, -1).trim();
  const closing = body.startsWith('/');
  if (closing) body = body.slice(1).trim();
  const selfClosing = body.endsWith('/');
  if (selfClosing) body = body.slice(0, -1).trim();

  // 属性名允许井号（#color 简写），值支持引号与裸值
  const attrRe = /([#a-zA-Z_][\w-]*)\s*=\s*("([^"]*)"|'([^']*)'|[^\s>]+)/g;
  const attrs: Record<string, string> = {};
  let m: RegExpExecArray | null;
  const nameMatch = body.match(/^([a-zA-Z_][\w-]*)/);
  if (!nameMatch) return null;
  const name = nameMatch[1].toLowerCase();
  // <color=#ff0000> 写法：标签名后紧跟 '=裸值'，先剥掉前导 '=' 与空白
  const rest = body.slice(nameMatch[0].length).replace(/^[\s=]+/, '').trim();
  if (rest && !rest.includes('=')) {
    // 裸值：color/size 标签把整个 rest 当作自身主属性
    attrs[name] = rest;
  } else {
    while ((m = attrRe.exec(rest)) !== null) {
      attrs[m[1].toLowerCase().replace(/^#/, '')] = m[3] ?? m[4] ?? m[2];
    }
  }
  return { name, closing, selfClosing, attrs };
}

export interface ParsedRichText {
  runs: RichRun[];
  /** 去除标签后的纯文本（图标位置保留 U+FFFC） */
  plain: string;
  /** 解析中遇到的非法标签（用于报告） */
  warnings: string[];
}

export function parseRichText(input: string, baseColor?: string): ParsedRichText {
  const runs: RichRun[] = [];
  const warnings: string[] = [];
  const stack: TagState[] = [];
  let current: RichRun = { text: '', color: baseColor };
  let plain = '';

  const snapshot = (): TagState => ({
    color: current.color,
    bold: current.bold,
    italic: current.italic,
  });

  const pushText = (text: string) => {
    if (!text) return;
    current.text += text;
    plain += text;
  };

  const breakRun = () => {
    if (current.text) {
      runs.push({ ...current });
      current = { text: '', color: current.color, bold: current.bold, italic: current.italic };
    }
  };

  const applyOpen = (tag: ParsedTag) => {
    // 在当前样式基础上叠加，保证嵌套标签继承外层颜色/粗斜体
    const state: TagState = {
      color: current.color,
      bold: current.bold,
      italic: current.italic,
    };
    switch (tag.name) {
      case 'color': {
        let c = tag.attrs.color ?? tag.attrs[Object.keys(tag.attrs)[0] ?? ''] ?? '';
        if (NAMED_COLORS[c.toLowerCase()]) c = NAMED_COLORS[c.toLowerCase()]!;
        if (c) state.color = c;
        break;
      }
      case 'b':
        state.bold = true;
        break;
      case 'i':
        state.italic = true;
        break;
      case 'size': {
        const v = Number(tag.attrs.size ?? tag.attrs[Object.keys(tag.attrs)[0] ?? '']);
        if (Number.isFinite(v)) (state as TagState & { sizeAbs?: number }).sizeAbs = v;
        break;
      }
      default:
        warnings.push(`未知标签 <${tag.name}>`);
        return;
    }
    stack.push(state);
    breakRun();
    current = { text: '', ...state };
  };

  const applyClose = (tag: ParsedTag) => {
    if (!stack.length) {
      warnings.push(`多余的闭合标签 </${tag.name}>`);
      return;
    }
    stack.pop();
    const prev = stack.length ? stack[stack.length - 1] : { color: baseColor };
    breakRun();
    current = { text: '', ...prev };
  };

  let i = 0;
  while (i < input.length) {
    const ch = input[i];
    if (ch === '\\' && (input[i + 1] === '<' || input[i + 1] === '>')) {
      pushText(input[i + 1]);
      i += 2;
      continue;
    }
    if (ch === '<') {
      const end = input.indexOf('>', i);
      if (end === -1) {
        pushText(input.slice(i));
        break;
      }
      const raw = input.slice(i, end + 1);
      const tag = parseTag(raw);
      if (!tag) {
        warnings.push(`无法解析标签 ${raw}`);
        pushText(raw);
        i = end + 1;
        continue;
      }
      if (tag.name === 'icon' && (tag.selfClosing || !tag.closing)) {
        const w = Number(tag.attrs.w ?? tag.attrs.width ?? 0);
        const h = Number(tag.attrs.h ?? tag.attrs.height ?? 0);
        const name = tag.attrs.name ?? tag.attrs.id ?? 'icon';
        breakRun();
        const obj = '￼';
        runs.push({
          text: obj,
          color: current.color,
          bold: current.bold,
          italic: current.italic,
          icon: { name, w: w || 16, h: h || 16 },
        });
        plain += obj;
        current = { text: '', color: current.color, bold: current.bold, italic: current.italic };
        i = end + 1;
        continue;
      }
      if (tag.closing) applyClose(tag);
      else if (tag.selfClosing) warnings.push(`标签 <${tag.name}> 不支持自闭合`);
      else applyOpen(tag);
      i = end + 1;
      continue;
    }
    pushText(ch);
    i++;
  }
  if (current.text) runs.push({ ...current });
  if (stack.length) warnings.push(`存在 ${stack.length} 个未闭合标签`);
  return { runs: runs.filter((r) => r.text.length > 0), plain, warnings };
}
