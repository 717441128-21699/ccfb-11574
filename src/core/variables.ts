/**
 * 模板变量替换。
 * 语法：{name} 与 %s/%d 位置占位；富文本标签内的内容不会被当作变量。
 * 数字按目标语言本地化（Intl.NumberFormat），玩家名等字符串直接代入。
 * 缺失变量保留原占位并在结果上打标记，供 UI 提示。
 */
import { tokenize } from './richText';

export interface SubstitutionResult {
  text: string;
  missing: string[];
}

const NAMED_RE = /\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g;
const POSITIONAL_RE = /%(?:s|d|(\.\d+)f)/g;

export function substitute(
  template: string,
  values: Record<string, string>,
  positional: string[] = [],
): SubstitutionResult {
  const missing = new Set<string>();

  // 先切成 token，只在 text token 上替换，避免 <icon=player{0}/> 这类误匹配
  const tokens = tokenize(template);
  let out = '';
  let posIndex = 0;

  for (const tok of tokens) {
    if (tok.type === 'tag') {
      out += template.slice(tok.offset, tok.offset + tok.rawLength);
      continue;
    }
    let piece = tok.value;
    piece = piece.replace(NAMED_RE, (whole, name: string) => {
      if (Object.prototype.hasOwnProperty.call(values, name)) return values[name];
      missing.add(name);
      return whole;
    });
    piece = piece.replace(POSITIONAL_RE, (whole) => {
      if (posIndex < positional.length) return positional[posIndex++];
      missing.add(`%${posIndex}`);
      return whole;
    });
    out += piece;
  }

  return { text: out, missing: [...missing] };
}

let numberFormatter: Intl.NumberFormat | undefined;

export function localizeNumber(value: number, locale: string): string {
  try {
    // 每次构造 formatter 代价高，按 locale 缓存（调用方通常单一语言批处理）
    if (!numberFormatter || (numberFormatter.resolvedOptions().locale !== locale)) {
      numberFormatter = new Intl.NumberFormat(locale);
    }
    return numberFormatter.format(value);
  } catch {
    return String(value);
  }
}

/**
 * 构造“最坏情况”变量集：
 * 数字取档案给的值（通常是位数最长的数），玩家名取最长档；
 * 各语言可以给出本地化后的数字与符合该语言字符集的长名字。
 */
export function buildProfileValues(
  profileValues: Record<string, string>,
  locale: string,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(profileValues)) {
    if (typeof v === 'number') out[k] = localizeNumber(v, locale);
    else out[k] = v;
  }
  return out;
}
