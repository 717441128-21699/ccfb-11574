/**
 * 核心数据模型：界面布局、文本表、字体、排版结果、检测问题。
 * 所有模块只依赖此文件，保证内核与渲染/UI 解耦。
 */

// ---------- 语言 ----------

export type Direction = 'ltr' | 'rtl';

export interface LanguageDef {
  /** BCP-47，用于 Intl.Segmenter / 数字本地化 */
  code: string;
  /** 界面上显示的名称 */
  label: string;
  /** 文本表里的列名 */
  tableColumn: string;
  /** 该语言的默认字体回退栈（族名按优先级） */
  fontStack: string[];
  /** 可由 bidi 判定覆盖；阿语等固定 rtl */
  forceDirection?: Direction;
  /** 断词策略：泰语/老挝语等无空格语言按 grapheme+word 词典断行 */
  wordBreak: 'space' | 'segmenter';
}

// ---------- 字体 ----------

export interface FontDef {
  /** 排版时引用的族名（布局文件里 fontFamily 写这个） */
  family: string;
  /** 多个 weight/style 可共用一个 family，key = `${style}:${weight}` */
  weight: number;
  style: 'normal' | 'italic';
  /** 内嵌字体来源；不填则视为系统字体（假定覆盖，不做缺字判定） */
  data?: ArrayBuffer;
  sourceName?: string;
  /** 解析后填充 */
  coverage?: FontCoverage;
  /** 浏览器 FontFace 加载后的 family 别名（内嵌字体用） */
  loadedFamily?: string;
  isSystem?: boolean;
}

/** 字体字形覆盖信息（来自 SFNT cmap 解析，区间用二分查找 membership） */
export interface FontCoverage {
  /** 排序后的不重叠区间，扁平存储 [start1,end1,start2,end2,...] */
  ranges: number[];
  format: number;
  numGlyphs: number;
  covers(codepoint: number): boolean;
}

// ---------- 布局文件 ----------

export type HorizontalAnchor = 'left' | 'center' | 'right' | 'stretch';
export type VerticalAnchor = 'top' | 'middle' | 'bottom' | 'stretch';

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TextComponentStyle {
  fontFamily?: string;
  fontSize: number;
  fontWeight?: number;
  italic?: boolean;
  color?: string;
  lineHeight?: number; // px；缺省 = fontSize * 1.2
  letterSpacing?: number;
  /** 富文本默认样式标签的基准色等 */
  align?: 'left' | 'center' | 'right';
  /** 文字相对控件框的内边距 */
  padding?: { left: number; right: number; top: number; bottom: number };
  /** 溢出处理 */
  overflow: 'wrap' | 'ellipsis' | 'clip' | 'overflow';
  /** 最多行数（ellipsis/clip 时生效）；undefined = 不限 */
  maxLines?: number;
  /** 垂直对齐 */
  verticalAlign?: 'top' | 'middle' | 'bottom';
}

export interface ControlDef {
  id: string;
  type: 'text' | 'button' | 'label' | 'input' | 'image' | 'container';
  /** 相对父容器的锚点；父为 screen 时即画布坐标 */
  rect: Rect;
  anchors?: {
    horizontal?: HorizontalAnchor;
    vertical?: VerticalAnchor;
    /** 锚定的同级/父控件 id；缺省父容器 */
    target?: string;
    /** 锚点边距 */
    margin?: { left?: number; right?: number; top?: number; bottom?: number };
  };
  /** 文本控件 */
  textKey?: string;
  /** 直接写死的文案（无 key 时用），检测结果行号记为 -1 */
  literalText?: string;
  style?: Partial<TextComponentStyle>;
  /** 按钮类控件：文本框相对按钮外框的内缩 */
  textFrameInset?: number;
  children?: ControlDef[];
}

export interface ScreenDef {
  id: string;
  name: string;
  /** 设计分辨率逻辑画布 */
  canvasSize: { width: number; height: number };
  controls: ControlDef[];
}

// ---------- 文本表 ----------

export interface TextTableEntry {
  key: string;
  /** 每种语言一列；key = 语言 tableColumn */
  values: Record<string, string>;
  /** 源文件中的 1 基行号，用于问题定位 */
  row: number;
  sourceFile: string;
}

export interface TextTable {
  sourceFile: string;
  entries: TextTableEntry[];
}

// ---------- 变量档案 ----------

export interface VariableProfile {
  id: string;
  label: string;
  /** 变量名 → 各语言的替换值（数字按语言本地化） */
  values: Record<string, Record<string, string>>;
}

// ---------- 富文本 ----------

export type RichTagType = 'color' | 'b' | 'i' | 'size' | 'icon' | 'close';

export interface RichToken {
  type: 'text' | 'tag';
  /** text: 原文片段；tag: 标签名 */
  value: string;
  /** tag 参数，如 <color=#FF0000> 的 #FF0000、<size=20> 的 20、<icon=coin> 的 coin */
  tagParam?: string;
  /** 该 token 在原始模板中的字节长度（标签含尖括号） */
  rawLength: number;
  /** 在原始模板中的字节偏移 */
  offset: number;
}

export interface RichSegment {
  kind: 'text' | 'icon';
  /** text: 纯文本内容；icon: 图标 id */
  content: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  italic: boolean;
  color: string;
  /** 该段在原始模板字符串中的字符偏移，用于问题定位 */
  sourceOffset: number;
  sourceLength: number;
  iconWidth?: number;
  iconHeight?: number;
}

// ---------- 排版结果 ----------

export interface LaidLine {
  /** 该行包含的段（已按 bidi 排好视觉顺序） */
  runs: LaidRun[];
  width: number;
  height: number;
  /** 行顶相对文本框 */
  y: number;
  /** 是否因 maxLines 被省略 */
  ellipsized: boolean;
  /** 是否因 clip 被硬切（有内容未渲染） */
  clipped: boolean;
}

export interface LaidRun {
  segment: RichSegment;
  /** 该 run 实际绘制的文本（图标 run 为空串） */
  text: string;
  /** 视觉绘制起点 x（相对文本框） */
  x: number;
  width: number;
  /** 单个 run 的方向（数字等 LTR run 在 RTL 段落里仍为 ltr） */
  direction: Direction;
}

export interface TextLayoutResult {
  controlId: string;
  screenId: string;
  language: string;
  profileId: string;
  direction: Direction;
  lines: LaidLine[];
  /** 文本实际占用边界（相对控件） */
  contentBounds: Rect;
  /** 文本可用框（控件 rect 减 padding/inset） */
  textFrame: Rect;
  /** 控件绝对 rect（解析锚点后） */
  controlRect: Rect;
  /** 排版用的最终字符串（替换变量后、去标签前） */
  resolvedText: string;
  /** 用到的回退字体记录：段索引 -> 实际命中的族名链 */
  fallbackTrace: { segmentIndex: number; requested: string; resolvedStack: string[] }[];
  /** 缺字记录 */
  missingGlyphs: { char: string; codepoint: number; segmentIndex: number }[];
  /** 文本表定位 */
  source: { file: string; row: number; key: string };
}

// ---------- 检测问题 ----------

export type IssueSeverity = 'error' | 'warning' | 'info';

export type IssueType =
  | 'overflow-x' // 文字超框（水平）
  | 'overflow-y' // 行数超框（垂直）
  | 'truncated' // 触发省略号，存在未显示内容
  | 'clipped' // 硬裁剪丢字
  | 'overlap' // 与其他控件压盖
  | 'missing-glyph' // 字体缺字（豆腐块风险）
  | 'font-fallback'; // 发生了字体回退（信息级，德文长词等预警）

export interface Issue {
  id: string;
  type: IssueType;
  severity: IssueSeverity;
  screenId: string;
  screenName: string;
  controlId: string;
  language: string;
  profileId: string;
  /** 文本表定位 */
  source: { file: string; row: number; key: string };
  message: string;
  /** 问题标注框（相对屏幕画布） */
  bounds: Rect;
  /** 超框量等量化数据 */
  metrics?: Record<string, number>;
}

// ---------- 批处理 ----------

export interface BatchJob {
  screenIds: string[];
  languageCodes: string[];
  profileIds: string[];
}

export interface BatchProgress {
  done: number;
  total: number;
  currentScreen?: string;
  issues: number;
  startedAt: number;
  elapsedMs: number;
}

export interface BatchReport {
  issues: Issue[];
  layouts: TextLayoutResult[];
  totalLayouts: number;
  elapsedMs: number;
  perLanguage: Record<string, number>;
}

// ---------- 图标注册表 ----------

export interface IconDef {
  id: string;
  width: number;
  height: number;
}

// ---------- 工程（一次导入的全部数据） ----------

export interface ProjectData {
  languages: LanguageDef[];
  fonts: FontDef[];
  screens: ScreenDef[];
  tables: TextTable[];
  profiles: VariableProfile[];
  icons: Record<string, IconDef>;
  baseStyles: TextComponentStyle;
}
