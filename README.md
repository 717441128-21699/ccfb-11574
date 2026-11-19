# I18N 界面文字溢出检测工具

游戏 UI 多语言文字问题的离线检测平台：导入界面布局与各语言文本表，按游戏内同样的
字体、字号、排版规则在 Canvas 上还原排版，自动标出**文字超框、截断、控件压盖、
字体缺字、自动缩字**五类问题，并把每个问题定位回文本表的具体行号。

## 解决的问题

- **排版还原**：字体回退链（嵌入字体 cmap 精确判断 + 系统字体运行时探测）、
  阿拉伯语 RTL 镜像与 Bidi 重排、泰文/印地语字素簇不断字、富文本颜色与图标占位计入宽度；
- **问题发现**：四种溢出模式（换行/截断/缩字/放行）全部建模，变量用各语言最长
  玩家名与最大数字替换后再排一遍，问题按界面 × 语言并排对比；
- **批量性能**：Worker 池并行（默认 `min(CPU 核数, 8)`），目标
  3000 界面 × 8 语言（24000 屏）5 分钟内完成，实时进度与吞吐量显示。

## 快速开始

```bash
npm install
npm run dev        # 开发服务器，打开后点「加载演示数据」
npm run build      # 类型检查 + 生产构建
npm test           # 核心模块单测
```

## 数据格式

### 布局 JSON（`LayoutDocument`）

```json
{
  "id": "main_hud",
  "name": "主界面",
  "designWidth": 1280,
  "designHeight": 720,
  "rtl": false,
  "widgets": [
    {
      "id": "btn_start",
      "type": "button",
      "rect": { "x": 120, "y": 300, "w": 150, "h": 56 },
      "textKey": "start_button",
      "fontSize": 18,
      "fontFamily": "GameUI",
      "lineHeight": 22,
      "hAlign": "center",
      "vAlign": "middle",
      "overflow": "truncate",
      "maxLines": 1,
      "padding": { "left": 8, "right": 8, "top": 4, "bottom": 4 },
      "rtlMirror": true
    }
  ]
}
```

`overflow` 取值：`wrap`（换行，超 maxLines 截断）、`truncate`（单行省略号）、
`shrink`（逐级缩字号到 8px 下限）、`overflow`（放行并检测越界）。
同时兼容 snake_case 字段（`font_size`、`max_lines` 等）。

### 文本表 CSV

首行表头必须含 `key` 列与语言列（`en,de,fr,es,ru,ar,th,hi,zh,ja` 的任意子集）。
支持引号、转义、CRLF；**数据行的物理行号会写进每个 Issue 的 `sourceRow`**。

```csv
key,en,de,ar,th
start_button,Start,Geschwindigkeit starten,ابدأ,เริ่ม
welcome,Welcome {playerName}!,Willkommen {playerName}!,...,
reward,"You earned <color=#ffcc00>{count} gold</color> <icon name=""coin"" w=18 h=18/>",...
```

### 富文本与变量

- 标签：`<color=#ffcc00>…</color>`、`<b>`、`<i>`、`<size=20>`、
  `<icon name="coin" w=18 h=18/>`；`\<` `\>` 为字面量转义；
- 变量：`{playerName}`、`{count}` 等。数字类变量（名字含 count/num/score/price…）
  替换为带千分位的 9 位数，其余替换为各语言最长玩家名样本；
  可在应用 `WorstCaseVars` 中覆盖任意变量的任意语言取值。

## 架构

```
src/
├── text/
│   ├── bidi.ts          # Bidi 基方向/视觉分段 + 字素簇切分（泰文/天城文/Emoji）
│   ├── richtext.ts      # 富文本标签解析
│   ├── variables.ts     # 变量最坏值替换
│   ├── fontCmap.ts      # TTF/OTF/WOFF cmap 静态解析（缺字精确判断）
│   ├── fontResolver.ts  # 字体回退链 + 同字体合并测量（保留 shaping/kerning）
│   └── layoutEngine.ts  # 断行/对齐/RTL 定位/四种溢出模式
├── engine/
│   ├── runner.ts        # 单屏编排（镜像→查表→替换→解析→排版→检测）
│   └── detector.ts      # 五类问题规则
├── render/ScreenRenderer.ts  # Canvas 还原绘制 + 问题高亮
├── workers/             # Worker 池与批量调度
├── io/importers.ts      # 布局 JSON / 文本表 CSV
└── ui/                  # 单屏预览、多语言并排、问题面板
```

## 已知边界

- WOFF2 的 cmap 不做静态解析（Brotli），该场景缺字判断回退到 `FontFaceSet.check` 运行时探测；
- 泰文/印地语的词边界断行采用辅音簇启发式（浏览器不暴露词典断词），
  与引擎集成 ICU 词典时可在 `bidi.ts` 的 `isBreakOpportunity` 替换；
- 图标占位按标签尺寸绘制虚线框，接入真实美术资源后替换 `ScreenRenderer.drawIcon` 即可。
