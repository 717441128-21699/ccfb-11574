/**
 * 变量替换：把模板中的 {name} 占位替换为最坏情况值。
 *
 * 最坏情况策略：
 *  - 玩家名：使用各语言真实的"最长常见玩家名"样本（德语长复合词、
 *    泰语/天城文长串、阿拉伯语带组合记号的名字）；
 *  - 数字：位数最大的取值（如 {count} → 999,999,999 量级）；
 *  - 未在配置中声明的变量：按变量名启发式给一个超长兜底值。
 */
import type { LangCode, WorstCaseVars } from '../types';

/** 各语言内置最坏值（可被项目配置覆盖） */
const BUILTIN_DEFAULTS: Record<string, Partial<Record<LangCode, string>>> = {
  playerName: {
    en: 'Maximiliana Thunderhammer III',
    de: 'Freifrau Maximiliana von Schwarzburg-Schwarzatal',
    fr: 'Marie-Antoinette de Montmorency-Luxembourg',
    es: 'Doña María de la Concepción Fernández de Córdoba',
    ru: 'Анастасия Александровна Всеволожская-Захарьина',
    ar: 'عبد العزيز بن محمد بن سعود بن فيصل آل سعود',
    th: 'นางสาวมกุฎราชกุมารี สิริวัณณวรี มหาจักรีสิรินธร',
    hi: 'महाराजाधिराज यशोधर्मन मौर्यचन्द्रगुप्त विक्रमादित्य बहादुर',
    zh: '阿尔伯特·冯·施瓦岑贝格-施瓦岑塔尔公爵夫人',
    ja: 'アレクサンドラ・フォン・シュヴァルツェンベルク＝シュヴァルツァタール三世',
  },
  name: {},
  count: {},
  number: {},
  level: {},
};

/** 数字类变量的最坏值（带千分位，德语用点作千分位） */
const BIG_NUMBER: Partial<Record<LangCode, string>> = {
  en: '999,999,999',
  de: '999.999.999',
  fr: '999 999 999',
  es: '999.999.999',
  ru: '999 999 999',
  ar: '٩٩٩٬٩٩٩٬٩٩٩',
  th: '999,999,999',
  hi: '99,99,99,999',
  zh: '999,999,999',
  ja: '999,999,999',
};

const NUMERIC_HINTS = ['count', 'num', 'number', 'amount', 'score', 'damage', 'gold', 'coin', 'price', 'level', 'lv', 'hp', 'mp', 'exp', 'size', 'time'];

function isNumericVar(name: string): boolean {
  const lower = name.toLowerCase();
  return NUMERIC_HINTS.some((h) => lower.includes(h));
}

/** 未配置变量的兜底超长字符串（保证一定会暴露宽度问题） */
function fallbackValue(name: string, lang: LangCode): string {
  if (isNumericVar(name)) return BIG_NUMBER[lang] ?? BIG_NUMBER.en!;
  // 非数字变量：复用玩家名样本，长度上做最坏假设
  return BUILTIN_DEFAULTS.playerName[lang] ?? BUILTIN_DEFAULTS.playerName.en!;
}

export function resolveVariable(name: string, lang: LangCode, config?: WorstCaseVars): string {
  const custom = config?.values[name]?.[lang];
  if (custom !== undefined) return custom;
  // 自定义变量在其他语言没配时，先退回英语自定义值
  const customEn = config?.values[name]?.en;
  if (customEn !== undefined) return customEn;
  const built = BUILTIN_DEFAULTS[name]?.[lang];
  if (built) return built;
  if (isNumericVar(name)) return BIG_NUMBER[lang] ?? BIG_NUMBER.en!;
  return fallbackValue(name, lang);
}

const VARIABLE_RE = /\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g;

/** 替换模板中的全部 {var}；未匹配花括号原样保留 */
export function substituteVariables(template: string, lang: LangCode, config?: WorstCaseVars): string {
  return template.replace(VARIABLE_RE, (_match, name: string) => resolveVariable(name, lang, config));
}

/** 提取模板中出现过的变量名（去重，保序） */
export function extractVariables(template: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  let m: RegExpExecArray | null;
  VARIABLE_RE.lastIndex = 0;
  while ((m = VARIABLE_RE.exec(template)) !== null) {
    if (!seen.has(m[1])) {
      seen.add(m[1]);
      out.push(m[1]);
    }
  }
  return out;
}
