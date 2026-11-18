import { describe, expect, it, beforeEach } from 'vitest';
import { detectScreen } from '../src/core/detector';
import { resetIssueSequence } from '../src/core/detector';
import { resolveScreen } from '../src/core/layoutResolver';
import type {
  LanguageDef,
  ScreenDef,
  TextComponentStyle,
  TextLayoutResult,
} from '../src/core/types';

const lang: LanguageDef = { code: 'de-DE', label: 'Deutsch', tableColumn: 'de', fontStack: ['Arial'], wordBreak: 'space' };

const style: TextComponentStyle = {
  fontFamily: 'Arial',
  fontSize: 16,
  fontWeight: 400,
  italic: false,
  color: '#fff',
  lineHeight: 20,
  letterSpacing: 0,
  align: 'left',
  padding: { left: 0, right: 0, top: 0, bottom: 0 },
  overflow: 'ellipsis',
  maxLines: 1,
  verticalAlign: 'top',
};

const screen: ScreenDef = {
  id: 's',
  name: '测试屏',
  canvasSize: { width: 400, height: 300 },
  controls: [
    { id: 'a', type: 'button', rect: { x: 0, y: 0, width: 100, height: 40 }, textKey: 'ka', style },
    { id: 'b', type: 'label', rect: { x: 120, y: 0, width: 100, height: 40 }, textKey: 'kb', style },
  ],
};

function layout(over: Partial<TextLayoutResult> = {}): TextLayoutResult {
  return {
    controlId: 'a',
    screenId: 's',
    language: lang.code,
    profileId: 'none',
    direction: 'ltr',
    lines: [{ runs: [], width: 80, height: 20, y: 0, ellipsized: false, clipped: false }],
    contentBounds: { x: 0, y: 0, width: 80, height: 20 },
    textFrame: { x: 0, y: 0, width: 100, height: 40 },
    controlRect: { x: 0, y: 0, width: 100, height: 40 },
    resolvedText: 'x',
    fallbackTrace: [],
    missingGlyphs: [],
    source: { file: 't.csv', row: 5, key: 'ka' },
    ...over,
  };
}

beforeEach(() => resetIssueSequence());

describe('检测器', () => {
  it('水平超框报 overflow-x 且带超框量', () => {
    const l = layout({
      lines: [{ runs: [], width: 140, height: 20, y: 0, ellipsized: false, clipped: false }],
      contentBounds: { x: 0, y: 0, width: 140, height: 20 },
    });
    const issues = detectScreen(screen, [l], resolveScreen(screen));
    const ox = issues.find((i) => i.type === 'overflow-x')!;
    expect(ox).toBeDefined();
    expect(ox.metrics?.overflowPx).toBe(40);
    expect(ox.source.row).toBe(5);
  });

  it('垂直超框报 overflow-y', () => {
    const l = layout({
      lines: [
        { runs: [], width: 50, height: 20, y: 0, ellipsized: false, clipped: false },
        { runs: [], width: 50, height: 20, y: 20, ellipsized: false, clipped: false },
        { runs: [], width: 50, height: 20, y: 40, ellipsized: false, clipped: false },
      ],
      contentBounds: { x: 0, y: 0, width: 50, height: 60 },
      textFrame: { x: 0, y: 0, width: 100, height: 40 },
    });
    const issues = detectScreen(screen, [l], resolveScreen(screen));
    expect(issues.some((i) => i.type === 'overflow-y')).toBe(true);
  });

  it('省略行报 truncated', () => {
    const l = layout({
      lines: [{ runs: [], width: 95, height: 20, y: 0, ellipsized: true, clipped: false }],
    });
    const issues = detectScreen(screen, [l], resolveScreen(screen));
    expect(issues.some((i) => i.type === 'truncated')).toBe(true);
  });

  it('缺字报 missing-glyph 并列出字符', () => {
    const l = layout({
      missingGlyphs: [
        { char: 'ก', codepoint: 0x0e01, segmentIndex: 0 },
        { char: 'า', codepoint: 0x0e32, segmentIndex: 0 },
      ],
    });
    const issues = detectScreen(screen, [l], resolveScreen(screen));
    const mg = issues.find((i) => i.type === 'missing-glyph')!;
    expect(mg.metrics?.count).toBe(2);
    expect(mg.message).toContain('ก');
  });

  it('两个控件墨迹相交报 overlap', () => {
    const la = layout({
      contentBounds: { x: 0, y: 0, width: 100, height: 20 },
      lines: [{ runs: [], width: 100, height: 20, y: 0, ellipsized: false, clipped: false }],
    });
    const lb = layout({
      controlId: 'b',
      controlRect: { x: 50, y: 0, width: 100, height: 40 },
      textFrame: { x: 0, y: 0, width: 100, height: 40 },
      contentBounds: { x: 0, y: 0, width: 100, height: 20 },
      source: { file: 't.csv', row: 6, key: 'kb' },
    });
    const issues = detectScreen(screen, [la, lb], resolveScreen(screen));
    expect(issues.some((i) => i.type === 'overlap')).toBe(true);
  });

  it('正常排版不报错误级问题', () => {
    const l = layout();
    const issues = detectScreen(screen, [l], resolveScreen(screen));
    expect(issues.filter((i) => i.severity === 'error')).toHaveLength(0);
  });
});
