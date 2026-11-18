/**
 * 排版问题检测。输入同一界面各语言的排版结果，输出带精确定位的 Issue。
 *
 * 规则：
 * - overflow-x：任一行内容宽度 > 文本框宽度（wrap 模式理论上不出现，overflow 模式直接超）
 * - overflow-y：累计行高 > 文本框高度
 * - truncated：触发省略号，存在未渲染内容
 * - clipped：硬裁剪丢字
 * - overlap：两个可见控件的文本内容边界相交（容器/纯图片控件不参与）
 * - missing-glyph：内嵌字体 cmap 缺字
 * - font-fallback：发生过字体回退（信息级）
 */
import { intersection, rectsIntersect, type ResolvedControl } from './layoutResolver';
import type {
  Issue,
  IssueSeverity,
  IssueType,
  ScreenDef,
  TextLayoutResult,
} from './types';

let issueSeq = 0;

function makeIssue(
  type: IssueType,
  severity: IssueSeverity,
  screen: ScreenDef,
  layout: TextLayoutResult,
  message: string,
  bounds: TextLayoutResult['controlRect'],
  metrics?: Record<string, number>,
): Issue {
  return {
    id: `iss-${++issueSeq}`,
    type,
    severity,
    screenId: screen.id,
    screenName: screen.name,
    controlId: layout.controlId,
    language: layout.language,
    profileId: layout.profileId,
    source: layout.source,
    message,
    bounds,
    metrics,
  };
}

export function detectScreen(
  screen: ScreenDef,
  layouts: TextLayoutResult[],
  resolved: Map<string, ResolvedControl>,
): Issue[] {
  const issues: Issue[] = [];

  for (const layout of layouts) {
    const frame = layout.textFrame;
    const ctrl = layout.controlRect;

    // 1. 水平超框
    const widestLine = layout.lines.reduce((m, l) => Math.max(m, l.width), 0);
    const overflowX = Math.max(0, widestLine - frame.width);
    if (overflowX > 0.5) {
      issues.push(
        makeIssue(
          'overflow-x',
          'error',
          screen,
          layout,
          `水平超框 ${overflowX.toFixed(1)}px（行宽 ${widestLine.toFixed(1)} / 框宽 ${frame.width.toFixed(1)}）`,
          { ...ctrl, x: ctrl.x + frame.x, width: frame.width },
          { overflowPx: overflowX, lineWidth: widestLine, frameWidth: frame.width },
        ),
      );
    }

    // 2. 垂直超框
    const textHeight = layout.lines.reduce((s, l) => s + l.height, 0);
    const overflowY = Math.max(0, textHeight - frame.height);
    if (overflowY > 0.5) {
      issues.push(
        makeIssue(
          'overflow-y',
          'error',
          screen,
          layout,
          `垂直超框 ${overflowY.toFixed(1)}px（内容 ${textHeight.toFixed(1)} / 框高 ${frame.height.toFixed(1)}）`,
          { ...ctrl, y: ctrl.y + frame.y, height: frame.height },
          { overflowPx: overflowY, contentHeight: textHeight, frameHeight: frame.height },
        ),
      );
    }

    // 3. 省略号截断
    const ellipsizedLine = layout.lines.find((l) => l.ellipsized);
    if (ellipsizedLine) {
      issues.push(
        makeIssue(
          'truncated',
          'error',
          screen,
          layout,
          '文本触发省略号，存在未显示内容',
          ctrl,
          { lineWidth: ellipsizedLine.width, frameWidth: frame.width },
        ),
      );
    }

    // 4. 硬裁剪
    if (layout.lines.some((l) => l.clipped)) {
      issues.push(
        makeIssue('clipped', 'error', screen, layout, '文本被硬裁剪，内容丢失', ctrl),
      );
    }

    // 5. 缺字
    if (layout.missingGlyphs.length > 0) {
      const chars = [...new Set(layout.missingGlyphs.map((m) => m.char))].slice(0, 8).join(' ');
      issues.push(
        makeIssue(
          'missing-glyph',
          'error',
          screen,
          layout,
          `字体缺字 ${layout.missingGlyphs.length} 处：${chars}`,
          ctrl,
          { count: layout.missingGlyphs.length },
        ),
      );
    }

    // 6. 字体回退（信息）
    const fellBack = layout.fallbackTrace.filter((t) => t.resolvedStack.length > 1);
    if (fellBack.length > 0) {
      issues.push(
        makeIssue(
          'font-fallback',
          'info',
          screen,
          layout,
          `发生 ${fellBack.length} 段字体回退，视觉可能与游戏内不一致`,
          ctrl,
          { segments: fellBack.length },
        ),
      );
    }
  }

  // 7. 控件压盖：同语言内两两检测文本控件的内容边界
  const textControls = layouts.filter((l) => {
    const rc = resolved.get(l.controlId);
    return rc && rc.control.type !== 'image' && rc.control.type !== 'container';
  });

  for (let i = 0; i < textControls.length; i++) {
    for (let j = i + 1; j < textControls.length; j++) {
      const a = textControls[i];
      const b = textControls[j];
      if (a.language !== b.language) continue;
      const aBox = contentScreenBox(a);
      const bBox = contentScreenBox(b);
      if (rectsIntersect(aBox, bBox, 2)) {
        const overlap = intersection(aBox, bBox);
        const area = Math.max(1, overlap.width * overlap.height);
        issues.push(
          makeIssue(
            'overlap',
            'warning',
            screen,
            a,
            `与控件 ${b.controlId} 文字压盖，重叠区 ${overlap.width.toFixed(0)}×${overlap.height.toFixed(0)}px`,
            overlap,
            { overlapArea: area },
          ),
        );
      }
    }
  }

  return issues;
}

/** 排版内容的屏幕绝对边界（只算实际墨迹范围，不算整个控件框）。 */
function contentScreenBox(layout: TextLayoutResult): TextLayoutResult['controlRect'] {
  const ctrl = layout.controlRect;
  const frame = layout.textFrame;
  const cb = layout.contentBounds;
  return {
    x: ctrl.x + frame.x + cb.x,
    y: ctrl.y + frame.y + cb.y,
    width: cb.width,
    height: cb.height,
  };
}

export function resetIssueSequence(): void {
  issueSeq = 0;
}
