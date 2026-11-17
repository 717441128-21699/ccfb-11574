import type { TextRun } from './types';

/**
 * 富文本解析:<color=#FF0000>…</color> <size=20>…</size> <b>…</b> <icon=gold/>
 * 标签外的 < > 按普通字符处理;非 rich 模式整段一个 run。
 */
export function parseRichText(input: string, rich: boolean): TextRun[] {
  if (!rich) return [{ kind: 'text', text: input }];

  const runs: TextRun[] = [];
  // 样式栈:颜色/字号/加粗
  const colorStack: (string | undefined)[] = [];
  const sizeStack: (number | undefined)[] = [];
  let boldDepth = 0;

  const cur = (): Partial<TextRun> => ({
    color: colorStack[colorStack.length - 1],
    size: sizeStack[sizeStack.length - 1],
    bold: boldDepth > 0 || undefined,
  });

  const pushText = (text: string) => {
    if (text) runs.push({ kind: 'text', text, ...cur() });
  };

  const TAG = /<(\/?)(color|size|b|icon)(?:=([^\s/>]+))?(\s*\/?)>/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = TAG.exec(input))) {
    pushText(input.slice(last, m.index));
    last = m.index + m[0].length;
    const [, closing, tag, arg, selfClose] = m;
    if (tag === 'icon') {
      if (arg) runs.push({ kind: 'icon', text: '', icon: arg, ...cur() });
    } else if (tag === 'b') {
      boldDepth += closing ? -1 : 1;
      if (boldDepth < 0) boldDepth = 0;
    } else if (closing) {
      if (tag === 'color') colorStack.pop();
      if (tag === 'size') sizeStack.pop();
    } else if (!selfClose.trim().endsWith('/') || tag !== 'icon') {
      if (tag === 'color') colorStack.push(arg);
      if (tag === 'size') {
        const n = Number(arg);
        sizeStack.push(Number.isFinite(n) ? n : undefined);
      }
    }
  }
  pushText(input.slice(last));
  return runs;
}

/** 变量代入:{player} {count} 及自定义表 */
export function substituteVars(text: string, vars: Record<string, string>): string {
  return text.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in vars ? vars[name] : whole,
  );
}
