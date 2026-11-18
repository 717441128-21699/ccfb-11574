import { describe, expect, it } from 'vitest';
import { layoutText, type LayoutInput } from '../src/core/layout';
import type { TextMeasurer } from '../src/core/measurer';
import type { LanguageDef, RichSegment, Direction, TextComponentStyle } from '../src/core/types';

/** 等宽假测量器：每个字符 10px，图标按 iconWidth；不做缺字。 */
class FakeMeasurer implements TextMeasurer {
  measure(text: string, _stack: string[], seg: RichSegment, _dir: Direction) {
    const width = Array.from(text).length * 10 + (seg.kind === 'icon' ? (seg.iconWidth ?? 0) - 10 : 0);
    return { width, family: seg.fontFamily, families: [seg.fontFamily], missing: [] };
  }
  lineMetrics(_stack: string[], seg: RichSegment) {
    return { ascent: seg.fontSize * 0.9, descent: seg.fontSize * 0.3 };
  }
}

const lang: LanguageDef = {
  code: 'en-US',
  label: 'English',
  tableColumn: 'en',
  fontStack: ['Arial'],
  wordBreak: 'space',
};

const rtlLang: LanguageDef = { ...lang, code: 'ar-SA', label: 'العربية', forceDirection: 'rtl' };

const baseStyle = (over: Partial<TextComponentStyle> = {}): TextComponentStyle => ({
  fontFamily: 'Arial',
  fontSize: 16,
  fontWeight: 400,
  italic: false,
  color: '#fff',
  lineHeight: 20,
  letterSpacing: 0,
  align: 'left',
  padding: { left: 0, right: 0, top: 0, bottom: 0 },
  overflow: 'wrap',
  verticalAlign: 'top',
  ...over,
});

function makeInput(over: Partial<LayoutInput> = {}): LayoutInput {
  const style = over.resolvedStyle ?? baseStyle();
  return {
    screenId: 's1',
    control: over.control ?? { id: 'c1', type: 'label', rect: { x: 0, y: 0, width: 100, height: 100 } },
    resolvedStyle: style,
    controlRect: over.controlRect ?? { x: 0, y: 0, width: 100, height: 100 },
    template: over.template ?? 'one two three four',
    language: over.language ?? lang,
    icons: {},
    source: { file: 't.csv', row: 2, key: 'k' },
    ...over,
  };
}

describe('换行与宽度', () => {
  it('框宽 100px、每字符 10px：每行约 10 字符，按空格断点换行', () => {
    const result = layoutText(makeInput({ template: 'aaa bbb ccc ddd' }), new FakeMeasurer());
    // "aaa bbb " = 8 字符后可断；各行不超过框宽
    for (const line of result.lines) expect(line.width).toBeLessThanOrEqual(100);
    expect(result.lines.length).toBeGreaterThan(1);
  });

  it('超长无断点词在 wrap 模式强制按字素簇断行', () => {
    const result = layoutText(
      makeInput({ template: 'aaaaaaaaaaaaaaaaaaaaaaaa', resolvedStyle: baseStyle({ overflow: 'wrap' }) }),
      new FakeMeasurer(),
    );
    expect(result.lines.length).toBeGreaterThan(1);
    for (const line of result.lines) expect(line.width).toBeLessThanOrEqual(100);
  });

  it('ellipsis 模式 maxLines=1 时超出部分以省略号收尾', () => {
    const result = layoutText(
      makeInput({
        template: 'aaa bbb ccc ddd eee',
        resolvedStyle: baseStyle({ overflow: 'ellipsis', maxLines: 1 }),
      }),
      new FakeMeasurer(),
    );
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0].ellipsized).toBe(true);
    const joined = result.lines[0].runs.map((r) => r.text).join('');
    expect(joined).toContain('…');
    expect(result.lines[0].width).toBeLessThanOrEqual(100);
  });

  it('clip 模式超宽标记 clipped 且不超框绘制', () => {
    const result = layoutText(
      makeInput({
        template: 'aaaaaaaaaaaaaaaaaaaaaaaa',
        resolvedStyle: baseStyle({ overflow: 'clip', maxLines: 1 }),
      }),
      new FakeMeasurer(),
    );
    expect(result.lines[0].clipped).toBe(true);
    expect(result.lines[0].width).toBeLessThanOrEqual(100);
  });

  it('overflow 模式保留超宽内容（交给检测器报错）', () => {
    const result = layoutText(
      makeInput({
        template: 'aaaaaaaaaaaaaaaaaaaaaaaa',
        resolvedStyle: baseStyle({ overflow: 'overflow', maxLines: 1 }),
      }),
      new FakeMeasurer(),
    );
    expect(result.lines[0].width).toBeGreaterThan(100);
  });

  it('显式换行符产生独立行', () => {
    const result = layoutText(makeInput({ template: 'line1\nline2\nline3' }), new FakeMeasurer());
    expect(result.lines).toHaveLength(3);
  });

  it('行首空白被吞掉', () => {
    const result = layoutText(
      makeInput({ template: 'aaa    bbb', controlRect: { x: 0, y: 0, width: 40, height: 100 } }),
      new FakeMeasurer(),
    );
    for (const line of result.lines) {
      const firstText = line.runs[0]?.text ?? '';
      expect(firstText.startsWith(' ')).toBe(false);
    }
  });
});

describe('对齐与垂直布局', () => {
  it('居中对齐首 run 起点大于 0', () => {
    const result = layoutText(
      makeInput({ resolvedStyle: baseStyle({ align: 'center' }), template: 'aaa' }),
      new FakeMeasurer(),
    );
    expect(result.lines[0].runs[0].x).toBeGreaterThan(0);
  });

  it('垂直居中时首行 y > 0', () => {
    const result = layoutText(
      makeInput({ resolvedStyle: baseStyle({ verticalAlign: 'middle' }), template: 'aaa' }),
      new FakeMeasurer(),
    );
    expect(result.lines[0].y).toBeGreaterThan(0);
  });

  it('内边距与按钮 inset 收缩文本框', () => {
    const result = layoutText(
      makeInput({
        control: { id: 'b', type: 'button', rect: { x: 0, y: 0, width: 100, height: 60 }, textFrameInset: 10 },
        controlRect: { x: 0, y: 0, width: 100, height: 60 },
        resolvedStyle: baseStyle({ padding: { left: 5, right: 5, top: 5, bottom: 5 } }),
        template: 'x',
      }),
      new FakeMeasurer(),
    );
    expect(result.textFrame.width).toBe(100 - 5 - 5 - 20);
    expect(result.textFrame.height).toBe(60 - 5 - 5 - 20);
  });
});

describe('RTL 与富文本', () => {
  it('阿语段落方向为 rtl', () => {
    const result = layoutText(
      makeInput({ language: rtlLang, template: 'السعر النهائي' }),
      new FakeMeasurer(),
    );
    expect(result.direction).toBe('rtl');
  });

  it('RTL 段落 run 视觉顺序反转', () => {
    const result = layoutText(
      makeInput({
        language: rtlLang,
        template: '<color=#f00>أحمر</color> أبيض',
      }),
      new FakeMeasurer(),
    );
    const line = result.lines[0];
    // 第一个视觉 run 来自逻辑上靠后的白色段（基准色 #fff）
    expect(line.runs[0].segment.color).toBe('#fff');
  });

  it('富文本图标段计入行宽', () => {
    const result = layoutText(
      makeInput({
        template: 'a<icon=coin/>b',
        icons: { coin: { width: 30, height: 30 } },
      }),
      new FakeMeasurer(),
    );
    const iconRun = result.lines[0].runs.find((r) => r.segment.kind === 'icon');
    expect(iconRun?.width).toBe(30);
  });

  it('源定位信息透传到结果', () => {
    const result = layoutText(makeInput(), new FakeMeasurer());
    expect(result.source).toEqual({ file: 't.csv', row: 2, key: 'k' });
    expect(result.screenId).toBe('s1');
    expect(result.controlId).toBe('c1');
  });
});

/** 模拟主字体缺字、回退到 FallbackSans 的测量器。 */
class FallbackMeasurer implements TextMeasurer {
  measure(text: string, _stack: string[], seg: RichSegment, _dir: Direction) {
    const width = Array.from(text).length * 10;
    return { width, family: 'FallbackSans', families: [seg.fontFamily, 'FallbackSans'], missing: [] };
  }
  lineMetrics(_stack: string[], seg: RichSegment) {
    return { ascent: seg.fontSize * 0.9, descent: seg.fontSize * 0.3 };
  }
}

describe('字体回退追踪', () => {
  it('命中非请求字体时记录回退链', () => {
    const result = layoutText(makeInput({ template: 'abc' }), new FallbackMeasurer());
    expect(result.fallbackTrace).toHaveLength(1);
    expect(result.fallbackTrace[0].requested).toBe('Arial');
    expect(result.fallbackTrace[0].resolvedStack).toContain('FallbackSans');
  });

  it('主字体全覆盖时不产生回退记录', () => {
    const result = layoutText(makeInput({ template: 'abc' }), new FakeMeasurer());
    expect(result.fallbackTrace).toHaveLength(0);
  });
});
