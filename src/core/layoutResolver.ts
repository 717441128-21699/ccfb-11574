/**
 * 界面布局解析：把锚点/嵌套层级解析为每个控件的屏幕绝对矩形。
 * v1 采用绝对 rect + 可选锚定边距模型，容器子控件相对父容器偏移。
 */
import type { ControlDef, Rect, ScreenDef } from './types';

export interface ResolvedControl {
  control: ControlDef;
  absoluteRect: Rect;
  parentRect: Rect;
}

export function resolveScreen(screen: ScreenDef): Map<string, ResolvedControl> {
  const out = new Map<string, ResolvedControl>();
  const screenRect: Rect = { x: 0, y: 0, width: screen.canvasSize.width, height: screen.canvasSize.height };

  const walk = (controls: ControlDef[], parentRect: Rect): void => {
    for (const c of controls) {
      const absolute = resolveRect(c, parentRect);
      out.set(c.id, { control: c, absoluteRect: absolute, parentRect });
      if (c.children?.length) walk(c.children, absolute);
    }
  };

  walk(screen.controls, screenRect);
  return out;
}

function resolveRect(control: ControlDef, parent: Rect): Rect {
  const base: Rect = {
    x: parent.x + control.rect.x,
    y: parent.y + control.rect.y,
    width: control.rect.width,
    height: control.rect.height,
  };
  const anchors = control.anchors;
  if (!anchors) return base;

  const margin = anchors.margin ?? {};
  const h = anchors.horizontal;
  const v = anchors.vertical;

  if (h === 'stretch') {
    base.x = parent.x + (margin.left ?? 0);
    base.width = parent.width - (margin.left ?? 0) - (margin.right ?? 0);
  } else if (h === 'right') {
    base.x = parent.x + parent.width - base.width - (margin.right ?? 0);
  } else if (h === 'center') {
    base.x = parent.x + (parent.width - base.width) / 2;
  } else {
    base.x = parent.x + control.rect.x + (margin.left ?? 0);
  }

  if (v === 'stretch') {
    base.y = parent.y + (margin.top ?? 0);
    base.height = parent.height - (margin.top ?? 0) - (margin.bottom ?? 0);
  } else if (v === 'bottom') {
    base.y = parent.y + parent.height - base.height - (margin.bottom ?? 0);
  } else if (v === 'middle') {
    base.y = parent.y + (parent.height - base.height) / 2;
  } else {
    base.y = parent.y + control.rect.y + (margin.top ?? 0);
  }

  return base;
}

/** 判断两个矩形是否相交（含阈值，容忍 1px 抗锯齿误差）。 */
export function rectsIntersect(a: Rect, b: Rect, tolerance = 1): boolean {
  return !(
    a.x + a.width <= b.x + tolerance ||
    b.x + b.width <= a.x + tolerance ||
    a.y + a.height <= b.y + tolerance ||
    b.y + b.height <= a.y + tolerance
  );
}

/** 求相交矩形。 */
export function intersection(a: Rect, b: Rect): Rect {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  return {
    x,
    y,
    width: Math.min(a.x + a.width, b.x + b.width) - x,
    height: Math.min(a.y + a.height, b.y + b.height) - y,
  };
}
