import { describe, expect, it } from 'vitest';
import { FontRegistry, GraphicsLike } from '../src/text/fontResolver';
import { layoutText } from '../src/text/layoutEngine';
import { parseRichText } from '../src/text/richtext';
import { substituteVariables } from '../src/text/variables';
import { detectIssues } from '../src/engine/detector';
import type { LayoutDocument, Widget } from '../src/types';

/**
 * 可控测量上下文：每个"字符"按 em 的固定比例测量，
 * 让换行/截断/缩字的断言不依赖平台字体。
 */
function makeMockGraphics(charsPerEm = 0.55): GraphicsLike {
  let fontSize = 16;
  return {
    set font(f: string) {
      const m = f.match(/(\d+(?:\.\d+)?)px/);
      if (m) fontSize = parseFloat(m[1]);
    },
    get font() {
      return `${fontSize}px sans`;
    },
    measureText(text: string) {
      const width = [...text].reduce((sum, ch) => {
        if (ch === ' ') return sum + fontSize * 0.28;
        if (ch === '￼') return sum + 18; // 图标占位
        return sum + fontSize * charsPerEm;
      }, 0);
      return { width };
    },
  };
}

function makeWidget(partial: Partial<Widget> & Pick<Widget, 'id' | 'rect'>): Widget {
  return {
    type: 'text',
    fontSize: 18,
    fontFamily: 'GameUI',
    lineHeight: 22,
    hAlign: 'left',
    vAlign: 'top',
    overflow: 'wrap',
    maxLines: 3,
    padding: { left: 0, right: 0, top: 0, bottom: 0 },
    ...partial,
  };
}

function run(widget: Widget, text: string, lang = 'en') {
  const registry = new FontRegistry();
  const g = makeMockGraphics();
  registry.bindGraphics(g);
  const parsed = parseRichText(text);
  return layoutText({ registry, g, lang }, widget, parsed.runs, 42, text);
}

describe('排版引擎', () => {
  it('窄框内自动换行，行数随宽度变化', () => {
    const widget = makeWidget({ id: 't', rect: { x: 0, y: 0, w: 60, h: 200 } });
    const tl = run(widget, 'one two three four five six');
    expect(tl.lines.length).toBeGreaterThan(2);
    for (const line of tl.lines) {
      expect(line.width).toBeLessThanOrEqual(60.5);
    }
  });

  it('truncate 模式单行截断并标记 truncated', () => {
    const widget = makeWidget({
      id: 't',
      rect: { x: 0, y: 0, w: 70, h: 30 },
      overflow: 'truncate',
      maxLines: 1,
    });
    const tl = run(widget, 'a very long text that cannot fit inside this button');
    expect(tl.truncated).toBe(true);
    expect(tl.lines.length).toBe(1);
  });

  it('wrap 超过 maxLines 同样截断', () => {
    const widget = makeWidget({ id: 't', rect: { x: 0, y: 0, w: 50, h: 44 }, maxLines: 2 });
    const tl = run(widget, 'alpha beta gamma delta epsilon zeta eta theta');
    expect(tl.truncated).toBe(true);
    expect(tl.lines.length).toBe(2);
  });

  it('shrink 模式逐级缩小字号直到容纳', () => {
    const widget = makeWidget({
      id: 't',
      rect: { x: 0, y: 0, w: 80, h: 26 },
      overflow: 'shrink',
      maxLines: 1,
    });
    const tl = run(widget, 'some fairly long single line content');
    expect(tl.effectiveFontSize).toBeLessThan(widget.fontSize);
    expect(tl.truncated).toBe(false);
  });

  it('overflow 模式放行且通过 bounds 标记越界', () => {
    const widget = makeWidget({
      id: 't',
      rect: { x: 0, y: 0, w: 50, h: 26 },
      overflow: 'overflow',
      maxLines: 1,
    });
    const tl = run(widget, 'this is much wider than the box');
    expect(tl.overflowed).toBe(true);
    expect(tl.bounds.w).toBeGreaterThan(50);
  });

  it('富文本颜色分段保留，图标占位计入行宽', () => {
    const widget = makeWidget({ id: 't', rect: { x: 0, y: 0, w: 400, h: 60 }, maxLines: 1, overflow: 'truncate' });
    const text = substituteVariables('Earn <color=#ffcc00>{count} gold</color> <icon name="coin" w=18 h=18/>', 'en');
    const tl = run(widget, text);
    const colored = tl.lines[0].runs.find((r) => r.text.includes('gold'));
    expect(colored?.color).toBe('#ffcc00');
    expect(tl.lines[0].runs.some((r) => r.icon?.name === 'coin')).toBe(true);
  });

  it('显式换行产生独立段落行', () => {
    const widget = makeWidget({ id: 't', rect: { x: 0, y: 0, w: 300, h: 200 } });
    const tl = run(widget, 'line one\nline two\nline three');
    expect(tl.lines.length).toBe(3);
  });

  it('RTL 语言下行方向为 rtl 且内容区水平镜像', () => {
    const widget = makeWidget({
      id: 't',
      rect: { x: 100, y: 0, w: 200, h: 60 },
      padding: { left: 10, right: 20, top: 0, bottom: 0 },
      rtlMirror: true,
    });
    const tl = run(widget, 'مرحبا بكم في اللعبة', 'ar');
    expect(tl.lines[0].dir).toBe('rtl');
    // 镜像后内容区 x 取右侧 padding
    expect(tl.contentRect.x).toBe(120);
  });

  it('变量替换后长玩家名触发截断，结果携带来源行号', () => {
    const widget = makeWidget({ id: 't', rect: { x: 0, y: 0, w: 120, h: 26 }, overflow: 'truncate', maxLines: 1 });
    const text = substituteVariables('Welcome {playerName}!', 'de');
    const tl = run(widget, text, 'de');
    expect(tl.sourceRow).toBe(42);
    expect(tl.truncated).toBe(true);
    expect(tl.resolvedText.length).toBeGreaterThan(20);
  });
});

describe('检测规则', () => {
  function layoutWith(widgets: Widget[]): LayoutDocument {
    return { id: 'L', name: 'L', designWidth: 400, designHeight: 400, widgets };
  }

  it('截断与超框生成带行号的 Issue', () => {
    const widget = makeWidget({
      id: 't',
      rect: { x: 0, y: 0, w: 60, h: 26 },
      overflow: 'truncate',
      maxLines: 1,
      textKey: 'k',
    });
    const tl = run(widget, 'long text that definitely gets cut off here');
    const screen = detectIssues({
      layout: layoutWith([widget]),
      lang: 'de',
      textLayouts: [tl],
      widgetCount: 1,
      durationMs: 0,
    });
    expect(screen.issues.some((i) => i.type === 'truncation' && i.sourceRow === 42)).toBe(true);
  });

  it('两个控件文本压盖超过阈值报 overlap', () => {
    const w1 = makeWidget({ id: 'a', rect: { x: 0, y: 0, w: 100, h: 40 } });
    const w2 = makeWidget({ id: 'b', rect: { x: 30, y: 10, w: 100, h: 40 } });
    const tl1 = run(w1, 'alpha beta gamma');
    const tl2 = run(w2, 'delta epsilon zeta');
    const screen = detectIssues({
      layout: layoutWith([w1, w2]),
      lang: 'en',
      textLayouts: [tl1, tl2],
      widgetCount: 2,
      durationMs: 0,
    });
    expect(screen.issues.some((i) => i.type === 'overlap')).toBe(true);
  });

  it('shrink 触发产生 warning 级问题', () => {
    const widget = makeWidget({
      id: 's',
      rect: { x: 0, y: 0, w: 70, h: 24 },
      overflow: 'shrink',
      maxLines: 1,
    });
    const tl = run(widget, 'content needing smaller font size to fit at all');
    const screen = detectIssues({
      layout: layoutWith([widget]),
      lang: 'en',
      textLayouts: [tl],
      widgetCount: 1,
      durationMs: 0,
    });
    const issue = screen.issues.find((i) => i.type === 'shrink');
    expect(issue?.severity).toBe('warning');
  });
});
