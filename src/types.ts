// ---------- 布局文件(游戏导出的界面描述) ----------

export type HAlign = 'left' | 'center' | 'right';
export type VAlign = 'top' | 'middle' | 'bottom';

export interface WidgetDef {
  id: string;
  /** label/button/panel/image;panel 与 image 不参与文本排版 */
  type: 'label' | 'button' | 'panel' | 'image';
  x: number; y: number; w: number; h: number;
  /** 文本表 key;panel/image 可空 */
  textKey?: string;
  fontSize?: number;          // px,默认 16
  fontFamily?: string;        // 逻辑字体名,缺省用默认栈
  align?: HAlign;             // 默认 left(阿语自动视为 right)
  valign?: VAlign;            // 默认 middle
  wrap?: boolean;             // 默认 true
  maxLines?: number;          // 0/缺省 = 不限
  ellipsis?: boolean;         // 截断时补 …
  padding?: number;           // 内边距 px
  rich?: boolean;             // 解析富文本标签
  background?: boolean;       // 背景控件,交叠检测跳过
}

export interface ScreenDef {
  id: string;
  name: string;
  width: number;
  height: number;
  widgets: WidgetDef[];
}

export interface LayoutFile {
  screens: ScreenDef[];
}

// ---------- 文本表 ----------

export interface TextEntry {
  key: string;
  /** CSV 中的行号(含表头,1 起),用于定位 */
  row: number;
  /** lang -> 原文(含 {var} 占位与富文本标签) */
  texts: Record<string, string>;
}

export interface TextTable {
  langs: string[];
  entries: Map<string, TextEntry>;
}

// ---------- 语言配置 ----------

export interface LangConfig {
  code: string;
  rtl: boolean;
  /** 有序字体回退栈,第一个是游戏主字体 */
  fontStack: string[];
}

// ---------- 排版结果 ----------

export interface TextRun {
  kind: 'text' | 'icon';
  text: string;        // kind=text
  icon?: string;       // kind=icon 的图标名
  color?: string;
  bold?: boolean;
  size?: number;       // 覆盖字号
}

export interface PositionedRun extends TextRun {
  x: number;           // 相对行起点
  width: number;
}

export interface LaidLine {
  runs: PositionedRun[];
  width: number;
}

export interface LayoutResult {
  lines: LaidLine[];
  /** 实际内容包围盒(相对控件内容区) */
  contentW: number;
  contentH: number;
  truncated: boolean;
  /** 逐语言排版后的文本(变量已代入) */
  resolvedText: string;
}

// ---------- 问题报告 ----------

export type IssueType = 'overflow-x' | 'overflow-y' | 'overlap' | 'missing-glyph' | 'missing-key';

export interface Issue {
  screenId: string;
  screenName: string;
  lang: string;
  widgetId: string;
  type: IssueType;
  textKey?: string;
  /** 文本表 CSV 行号;-1 = 无对应行 */
  row: number;
  message: string;
  /** 实测 vs 盒子 */
  measured?: { w: number; h: number };
  box?: { w: number; h: number };
}

export interface WidgetLayout {
  widget: WidgetDef;
  result: LayoutResult | null;
  /** 文本实际渲染矩形(屏幕坐标),可能超出声明框 */
  textRect: { x: number; y: number; w: number; h: number } | null;
  missingGlyphs: string[];
}

export interface ScreenReport {
  screen: ScreenDef;
  lang: string;
  layouts: WidgetLayout[];
  issues: Issue[];
}
