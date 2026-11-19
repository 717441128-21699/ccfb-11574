/**
 * 全局领域模型与类型定义。
 *
 * 数据流向：
 *   布局文件 + 文本表 + 字体配置
 *     → 文本替换/富文本解析
 *     → 字体回退解析 + 测量
 *     → 换行/Bidi/排版
 *     → Canvas 绘制
 *     → 规则检测 → Issue 报告（定位到文本表行号）
 */

/** 支持的八种语言（BCP-47 语言标签） */
export type LangCode =
  | 'en'
  | 'de'
  | 'fr'
  | 'es'
  | 'ru'
  | 'ar'
  | 'th'
  | 'hi'
  | 'zh'
  | 'ja';

/** 界面设计分辨率下的矩形（像素） */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 文本超出控件框时的处理方式，对应游戏引擎里的常用模式 */
export type OverflowMode =
  | 'wrap' // 自动换行；行数超过 maxLines 后按 truncate 处理
  | 'truncate' // 单行截断，追加省略号
  | 'shrink' // 自动缩小字号直到适配
  | 'overflow'; // 允许溢出（仅检测，不裁剪）

export type HAlign = 'left' | 'center' | 'right';
export type VAlign = 'top' | 'middle' | 'bottom';

/** 富文本解析后的最小片段 */
export interface RichRun {
  /** 文本内容（纯文本，图标占位为单个 \\uFFFC） */
  text: string;
  color?: string;
  bold?: boolean;
  italic?: boolean;
  /** 内联图标占位的尺寸（null 表示普通文字片段） */
  icon?: { name: string; w: number; h: number };
}

/** 字体族定义：主字体 + 回退链 + 粗细风格映射 */
export interface FontConfig {
  family: string;
  /** CSS font-family 栈，浏览器直接可用的系统字体回退 */
  cssStack: string[];
  /** 已注册的可嵌入字体文件（FontFace 已加载） */
  embedded: EmbeddedFont[];
  /** 回退链：当主字体缺少某码点时依次尝试 */
  fallbacks: FontFallback[];
}

export interface EmbeddedFont {
  family: string;
  weight: number;
  style: 'normal' | 'italic';
  /** 已加载的 FontFace（worker / 主线程都可注册） */
  face?: FontFace;
  /** 从字体文件解析出的 cmap 覆盖码点集合（缺失码点检测用） */
  coverage?: Set<number>;
}

export interface FontFallback {
  family: string;
  cssStack: string[];
  embedded?: EmbeddedFont[];
  /** 系统字体无法读 cmap 时，按 Unicode 区块给出启发式覆盖判断 */
  heuristic?: UnicodeRangeRule[];
}

export interface UnicodeRangeRule {
  /** Unicode 码点闭区间 */
  ranges: [number, number][];
  covers: boolean;
}

/** 文本表中的一条词条 */
export interface TextEntry {
  key: string;
  /** 模板文本（可含 {var} 变量与富文本标签） */
  text: string;
  /** 来源文件中的 1 基行号（CSV/Excel 行号；JSON 数组为元素序号） */
  row: number;
  source?: string;
}

/** 一种语言的完整文本表 */
export interface TextTable {
  lang: LangCode;
  entries: TextEntry[];
  /** key → entries 下标，快速查表 */
  index: Map<string, number>;
}

/** 变量最坏情况替换值配置 */
export interface WorstCaseVars {
  /** 变量名 → 各语言替换值；未配置语言使用内置默认值 */
  values: Record<string, Partial<Record<LangCode, string>>>;
}

/** 界面上的一个控件 */
export interface Widget {
  id: string;
  type: 'text' | 'image' | 'button' | 'panel' | 'container';
  rect: Rect;
  /** text/button 控件引用的文本表 key */
  textKey?: string;
  /** 直接内联的文本（无 key 时使用，row 记为 0） */
  inlineText?: string;
  fontSize: number;
  fontFamily?: string;
  lineHeight: number;
  bold?: boolean;
  italic?: boolean;
  color?: string;
  hAlign: HAlign;
  vAlign: VAlign;
  overflow: OverflowMode;
  maxLines: number;
  letterSpacing?: number;
  /** 文本四周内边距 */
  padding: { left: number; right: number; top: number; bottom: number };
  /** 该控件是否在 RTL 语言下水平镜像 */
  rtlMirror?: boolean;
  /** 子控件（容器） */
  children?: Widget[];
  /** 来源布局文件中的行号（JSON 无行号时为 0） */
  sourceLine?: number;
}

/** 一份界面布局文档 */
export interface LayoutDocument {
  id: string;
  name: string;
  /** 设计分辨率 */
  designWidth: number;
  designHeight: number;
  /** 该界面整体在 RTL 下镜像 */
  rtl?: boolean;
  widgets: Widget[];
  source?: string;
}

/** 排版后一行的几何信息（检测与绘制共用） */
export interface LaidLine {
  runs: LaidRun[];
  width: number;
  height: number;
  /** 行顶相对于控件内容区顶部的 y 偏移 */
  y: number;
  /** 该行的段落方向 */
  dir: 'ltr' | 'rtl';
  truncated?: boolean;
}

export interface LaidRun {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color?: string;
  bold?: boolean;
  italic?: boolean;
  font: string;
  fontSize: number;
  icon?: { name: string; w: number; h: number };
  /** 该行内的视觉顺序索引（Bidi 重排后） */
  visualIndex: number;
}

/** 单个文本控件的排版结果 */
export interface TextLayoutResult {
  widgetId: string;
  lines: LaidLine[];
  /** 文本实际占用边界（相对控件坐标系） */
  bounds: Rect;
  /** 内容区（扣除 padding 与 RTL 镜像后的可排版区域） */
  contentRect: Rect;
  /** shrink 模式下最终使用的字号 */
  effectiveFontSize: number;
  truncated: boolean;
  overflowed: boolean;
  /** 排版过程中发现字体链无法覆盖的码点 */
  missingGlyphs: { char: string; codePoint: number }[];
  /** 关联文本表行号（0 = 内联文本无来源行） */
  sourceRow: number;
  textKey?: string;
  /** 实际参与排版的文本（变量替换、富文本展开后） */
  resolvedText: string;
}

export type IssueSeverity = 'error' | 'warning' | 'info';

export type IssueType =
  | 'overflow' // 文字超出控件框
  | 'truncation' // 文本被截断（出现省略号）
  | 'overlap' // 两个控件的文本/内容互相压盖
  | 'missing-glyph' // 字体链缺字
  | 'shrink'; // shrink 模式触发（字号被缩小，可能不符合设计）

export interface Issue {
  type: IssueType;
  severity: IssueSeverity;
  layoutId: string;
  lang: LangCode;
  widgetId: string;
  textKey?: string;
  /** 文本表行号 —— 修复入口 */
  sourceRow: number;
  source?: string;
  message: string;
  /** 问题在界面上的高亮框（设计分辨率坐标） */
  rect: Rect;
  /** 与该问题相关的另一控件（overlap 时使用） */
  relatedWidgetId?: string;
  /** 缺字明细 */
  missing?: { char: string; codePoint: number }[];
  /** 实际宽度 vs 可用宽度等量化数据 */
  metrics?: Record<string, number>;
}

/** 单个界面 × 单语言的检测结果 */
export interface ScreenResult {
  layoutId: string;
  layoutName: string;
  lang: LangCode;
  issues: Issue[];
  textLayouts: TextLayoutResult[];
  durationMs: number;
  widgetCount: number;
}

/** 批量任务进度 */
export interface BatchProgress {
  done: number;
  total: number;
  currentLayout?: string;
  currentLang?: LangCode;
  issuesFound: number;
  elapsedMs: number;
}

export interface BatchReport {
  results: ScreenResult[];
  totalIssues: number;
  byType: Record<IssueType, number>;
  byLang: Partial<Record<LangCode, number>>;
  durationMs: number;
  screens: number;
  languages: number;
}

/** Worker 协议：主线程 → worker */
export type WorkerRequest =
  | {
      kind: 'init';
      fonts: SerializedFontConfig[];
      worstCase: WorstCaseVars;
    }
  | {
      kind: 'run';
      id: number;
      layout: LayoutDocument;
      table: TextTable;
      lang: LangCode;
      worstCase?: WorstCaseVars;
    }
  | { kind: 'cancel' };

/** Worker 协议：worker → 主线程 */
export type WorkerResponse =
  | { kind: 'ready' }
  | { kind: 'result'; id: number; result: ScreenResult }
  | { kind: 'error'; id: number; message: string };

/** 可跨 worker 传递的字体配置（FontFace 在 worker 内自行重建） */
export interface SerializedFontConfig {
  family: string;
  cssStack: string[];
  fallbacks: {
    family: string;
    cssStack: string[];
    heuristic?: UnicodeRangeRule[];
  }[];
  embedded: {
    family: string;
    weight: number;
    style: 'normal' | 'italic';
    /** 字体文件二进制，worker 内 new FontFace(...) */
    data?: ArrayBuffer;
  }[];
}
