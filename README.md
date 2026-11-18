# 游戏多语言文字溢出排查工具

面向游戏 UI 本地化的文字溢出静态排查工具：导入**界面布局文件**与**各语言文本表**，
按游戏内同样的字体、字号与排版规则在 Canvas 上重排八种语言，自动标出
**超框 / 截断 / 控件压盖 / 字体缺字 / 字体回退**，每个问题定位到文本表的具体行号。

## 解决的问题

- **排得跟游戏里一样**：同字号、同字重、同行高、同内边距与按钮 inset；字体按回退链逐码点
  判定（自研 SFNT `cmap` 解析，TTF/OTF/WOFF），缺字精确上报；阿语 RTL、泰语/印地语组合
  字形交给浏览器原生 shaping 引擎（HarfBuzz 级），富文本 `<color>/<b>/<i>/<size>/<icon/>`
  的颜色与图标占位全部计入行宽。
- **把问题揪出来**：水平/垂直超框、省略号截断、硬裁剪丢字、控件墨迹压盖、缺字豆腐块、
  字体回退；同界面八语言并排 Canvas；变量句子用「最长玩家名 / 最大数字」档案代入再排一遍；
  每条 issue 带 `文本表文件:行号 + key + 控件 + 语言 + 档案`。

## 快速开始

```bash
npm install
npm run dev        # 打开 http://localhost:5173，内置 5 个演示界面 × 8 语言 × 2 套变量档案
npm test           # 59 个单元/端到端测试
npm run benchmark  # 3000 界面 × 8 语言压力基准
npm run build      # 类型检查 + 生产构建（含 Worker 分包）
```

演示数据刻意覆盖典型事故：德语长复合词撑爆按钮、泰语无空格长句、阿语 RTL+变量、
超长玩家名、富文本彩色标签与图标占位。点「开始批量检测」即可看到红框标注与右侧问题清单。

## 目录结构

```
src/
  core/                 纯 TS 排版内核（无 DOM 依赖，可完整单测）
    types.ts            全部数据契约
    fontCmap.ts         SFNT/WOFF 解析 + cmap format 4/12/6 覆盖区间（二分查找）
    bidi.ts             UAX#9 首强字符方向 + 富文本段 bidi run 切分
    segment.ts          Intl.Segmenter 字素簇/词典断行（泰语、印地语）
    richText.ts         富文本标签解析 → 样式段
    variables.ts        {name}/%s 变量替换 + 数字本地化
    measurer.ts         TextMeasurer 抽象 + 字体回退解析器
    layout.ts           排版引擎：原子展平 → 贪心换行 → 省略/裁剪 → 对齐
    layoutResolver.ts   锚点/嵌套 → 控件绝对矩形
    detector.ts         七类问题检测
    pipeline.ts         界面×语言×档案编排
    importers.ts        布局 JSON / 文本表 JSON+CSV / 字体导入
  engine/
    canvasMeasurer.ts   Canvas measureText 实现（带缓存、逐码点回退）
    canvasRender.ts     排版结果 → Canvas 绘制 + 问题红框
    batch.worker.ts     OffscreenCanvas Worker
    workerPool.ts       Worker 池分片调度 + 同步降级
  ui/                   无框架三栏 UI（store + Canvas 网格 + 问题面板）
  data/sampleData.ts    内置示例工程
examples/               可用于「导入」按钮的样例文件
bench/stress.ts         3000×8 压力基准
test/                   vitest 测试
```

## 数据格式

### 界面布局（JSON 数组）

```json
{
  "id": "shop",
  "name": "商店主界面",
  "canvasSize": { "width": 720, "height": 480 },
  "controls": [
    {
      "id": "buy_btn",
      "type": "button",
      "rect": { "x": 40, "y": 380, "width": 180, "height": 48 },
      "textKey": "shop_buy_now",
      "textFrameInset": 12,
      "anchors": { "horizontal": "left", "vertical": "bottom",
                   "margin": { "left": 8, "bottom": 8 } },
      "style": {
        "fontFamily": "GameSans", "fontSize": 18, "fontWeight": 600,
        "color": "#ffffff", "lineHeight": 22, "letterSpacing": 0,
        "align": "center", "verticalAlign": "middle",
        "overflow": "ellipsis", "maxLines": 1,
        "padding": { "left": 0, "right": 0, "top": 0, "bottom": 0 }
      }
    }
  ]
}
```

`overflow`：`wrap`（自动换行，长词强制在字素簇边界断）/ `ellipsis`（行数超限补 `…`）/
`clip`（硬裁剪）/ `overflow`（放任超框，只检测不处理）。

### 文本表（CSV 或 JSON）

CSV 首行为 `key,zh,en,de,ja,ko,th,hi,ar`，列名与语言定义的 `tableColumn` 对应；
JSON 形态为 `[{ "key": "...", "en": "..." }, ...]` 或 `{ "entries": [...] }`。

富文本：`<color=#RRGGBB>` / `<color=red>`、`<b>`、`<i>`、`<size=22>`、`<icon=coin/>`。
变量：`{player}`、`{price}` 命名占位，或 `%s`/`%d` 位置占位。

### 变量档案

每个档案按语言给出最坏情况替换值（最长玩家名、最大位数数字，数字按 locale 本地化）。
批处理可同时勾选多套档案，issue 上会标注由哪个档案触发。

## 字体与缺字判定

- 导入 TTF/OTF/WOFF 后解析 `cmap`，排版时按「请求族名 → 语言回退栈」逐码点找第一个
  覆盖该字符的字体；整条链都不覆盖则记 **missing-glyph**（豆腐块风险）。
- 不导入内嵌字体时使用系统字体栈，浏览器自行回退，缺字判定关闭（界面会提示）。
- **WOFF2 不支持**（Brotli 变换 SFNT），导入会给出明确错误，请先转成 TTF/OTF/WOFF。
- 发生真实回退（命中字体 ≠ 请求字体）时记 info 级 **font-fallback**，预警视觉差异。

## 复杂文字与 RTL 的实现边界

| 场景 | 处理方式 |
| --- | --- |
| 泰语/印地语组合字形、合字 | `Intl.Segmenter` 保证换行/省略只在字素簇边界；shaping 由 Canvas 原生引擎完成 |
| 泰语无空格断行 | Segmenter `word` 粒度词典断词，未命中长词在字素簇边界强制断 |
| 阿语段落方向 | 首强字符判定 + 语言强制 RTL；Canvas `dir` 控制 shaping，数字自动保持 LTR run |
| 阿语连写 | 每个视觉 run 以原生方向测量与绘制，浏览器负责字形连写 |
| 富文本多色 RTL | 段级 bidi：段落反转后逐 run 绘制（完整字符级 UAX#9 反转列为后续增强） |

## 性能

- Worker 池（默认 `hardwareConcurrency - 1`）+ OffscreenCanvas，按界面轮转分片负载均衡；
  测量结果按 `(font, dir, text)` 缓存，词表有限时命中率高。
- 基准（Node 假测量器，纯算法开销）：3000 界面 × 8 语言 = **81,600 次排版 ≈ 5 秒**，
  吞吐约 1.6 万排版/秒。真实 Canvas `measureText` 更贵，UI 顶栏会显示实测吞吐并外推
  「5 分钟可排多少个」；不支持 Worker 的环境自动降级为同步流水线。

## 检测规则一览

| 类型 | 级别 | 判定 |
| --- | --- | --- |
| `overflow-x` | error | 任一行墨迹宽度 > 文本框宽度，附超框像素数 |
| `overflow-y` | error | 累计行高 > 文本框高度 |
| `truncated` | error | 触发省略号且存在未渲染内容 |
| `clipped` | error | 硬裁剪丢弃了字符 |
| `overlap` | warning | 两个文本控件的实际墨迹矩形相交（2px 容差） |
| `missing-glyph` | error | 内嵌字体 cmap 不覆盖该码点 |
| `font-fallback` | info | 实际命中字体与请求字体不同 |

## 后续增强建议

- 接入游戏引擎的真实排版 SDK（Unity TextMeshPro / Cocos Label 配置）做交叉校验；
- 完整字符级 UAX#9（引入 `@unicode/unicode-bidirectional`）替代段级反转；
- WOFF2 支持（WASM Brotli 解码）；
- 报告导出（JSON/CSV/HTML 快照）接入 CI 发版门禁。
