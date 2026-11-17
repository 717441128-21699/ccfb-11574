import type { LaidLine, LayoutResult, PositionedRun, TextRun } from './types';
import type { Measurer } from './measure';

export interface LayoutOpts {
  lang: string;
  rtl: boolean;
  availW: number;        // 内容区宽(已扣 padding)
  availH: number;        // 内容区高
  baseSize: number;
  stackCSS: string;
  wrap: boolean;
  maxLines: number;      // 0 = 不限
  ellipsis: boolean;
  leading: number;       // 行距倍数
  iconRatio: number;     // 图标宽 = 字号 * ratio
}

const segmenters = new Map<string, Intl.Segmenter>();
function segmenterFor(lang: string): Intl.Segmenter {
  let s = segmenters.get(lang);
  if (!s) {
    s = new Intl.Segmenter(lang, { granularity: 'word' });
    segmenters.set(lang, s);
  }
  return s;
}

interface Unit {
  run: TextRun;      // 单 segment 的 run(保留样式)
  width: number;
  space: boolean;    // 纯空白,可在行首丢弃
}

/** 把 run 序列切成可断行单元:泰语/中文按词典与规则断,西文按词断 */
function toUnits(runs: TextRun[], o: LayoutOpts, me: Measurer): Unit[] {
  const units: Unit[] = [];
  for (const run of runs) {
    const size = run.size ?? o.baseSize;
    if (run.kind === 'icon') {
      units.push({ run, width: size * o.iconRatio, space: false });
      continue;
    }
    const seg = segmenterFor(o.lang);
    for (const s of seg.segment(run.text)) {
      const text = s.segment;
      units.push({
        run: { ...run, text },
        width: me.measureText(text, size, o.stackCSS, run.bold),
        space: /^\s+$/.test(text),
      });
    }
  }
  return units;
}

function lineHeight(runs: TextRun[], baseSize: number, leading: number): number {
  let max = baseSize;
  for (const r of runs) if (r.size && r.size > max) max = r.size;
  return max * leading;
}

/** 贪心断行 + 截断,产出视觉顺序(run 已按显示方向排好,x 相对行左缘) */
export function layoutRuns(runs: TextRun[], o: LayoutOpts, me: Measurer): LayoutResult {
  const empty: LayoutResult = { lines: [], contentW: 0, contentH: 0, truncated: false, resolvedText: '' };
  if (!runs.length) return empty;

  const units = toUnits(runs, o, me);
  const logicalLines: Unit[][] = [];
  let truncated = false;

  if (!o.wrap) {
    logicalLines.push(units.filter((u) => !(u.space && u.width === 0)));
  } else {
    let cur: Unit[] = [];
    let curW = 0;
    const flush = () => {
      while (cur.length && cur[cur.length - 1].space) cur.pop(); // 行尾空白不渲染
      if (cur.length) logicalLines.push(cur);
      cur = [];
      curW = 0;
    };
    for (const u of units) {
      if (u.space && !cur.length) continue; // 行首空白丢弃
      if (cur.length && curW + u.width > o.availW + 0.5) {
        flush();
        if (u.space) continue;
      }
      cur.push(u);
      curW += u.width;
    }
    flush();
  }

  // 行数限制 + 省略号
  if (o.maxLines > 0 && logicalLines.length > o.maxLines) {
    logicalLines.length = o.maxLines;
    truncated = true;
  }
  // 超高也算截断(控件高度放不下)
  const heights = logicalLines.map((l) => lineHeight(l.map((u) => u.run), o.baseSize, o.leading));
  let totalH = heights.reduce((a, b) => a + b, 0);
  if (totalH > o.availH + 0.5 && logicalLines.length > 1) {
    let acc = 0;
    let keep = 0;
    for (const h of heights) {
      if (acc + h > o.availH + 0.5) break;
      acc += h;
      keep++;
    }
    if (keep < logicalLines.length) {
      logicalLines.length = Math.max(keep, 1);
      truncated = true;
    }
    totalH = heights.slice(0, logicalLines.length).reduce((a, b) => a + b, 0);
  }

  if (truncated && o.ellipsis && logicalLines.length) {
    const last = logicalLines[logicalLines.length - 1];
    const style = last[last.length - 1]?.run ?? runs[runs.length - 1];
    const ell: Unit = {
      run: { ...style, kind: 'text', text: '…' },
      width: me.measureText('…', style.size ?? o.baseSize, o.stackCSS, style.bold),
      space: false,
    };
    let w = last.reduce((a, u) => a + u.width, 0);
    while (last.length && w + ell.width > o.availW + 0.5) {
      w -= last.pop()!.width;
    }
    last.push(ell);
  }

  // 组装:视觉顺序 + 行内 x
  const lines: LaidLine[] = logicalLines.map((units2) => {
    const visual = o.rtl ? [...units2].reverse() : units2;
    let x = 0;
    const runs2: PositionedRun[] = visual.map((u) => {
      const pr: PositionedRun = { ...u.run, x, width: u.width };
      x += u.width;
      return pr;
    });
    return { runs: runs2, width: x };
  });

  return {
    lines,
    contentW: lines.reduce((a, l) => Math.max(a, l.width), 0),
    contentH: totalH,
    truncated,
    resolvedText: runs.map((r) => (r.kind === 'text' ? r.text : `[icon:${r.icon}]`)).join(''),
  };
}
