# 多语言文本溢出检查器 (l10n-overflow-checker)

网页工具:导入游戏界面布局 + 多语言文本表,在 Canvas 上按游戏排版规则重排每种语言,
自动揪出**文字超框、截断、控件交叠、缺字形、缺翻译**,并把每个问题定位到文本表行号。

## 运行

```bash
npm install
npm run dev        # 开发
npm run build      # 类型检查 + 产物构建
npm test           # 逻辑层冒烟测试(无需浏览器)
```

打开页面后:**加载演示数据** 可直接看到德语撑爆按钮、泰语/阿语排版、交叠标红的效果;
**生成 3000 界面压测** 验证性能(3000 界面 × 8 语言,逻辑层约 2~3 秒)。

## 输入格式

### 布局 JSON(从游戏 UI 编辑器导出)

```json
{
  "screens": [{
    "id": "main_menu", "name": "主菜单", "width": 800, "height": 450,
    "widgets": [{
      "id": "btn_play", "type": "button",
      "x": 60, "y": 120, "w": 110, "h": 40,
      "textKey": "menu.play", "fontSize": 18,
      "align": "center", "valign": "middle",
      "wrap": false, "maxLines": 1, "ellipsis": true,
      "padding": 4, "rich": false, "background": false
    }]
  }]
}
```

- `type`: `label` / `button` / `panel` / `image`(后两者不排版)
- `background: true` 的控件不参与交叠检测;互相包含的控件视为父子,不报交叠
- `rich: true` 时解析富文本标签

### 文本表 CSV

首行表头 `key,en,de,ja,ko,zh,th,hi,ar`(语言列任意,界面里勾选参与检查的语言)。
支持引号包裹、内嵌逗号与换行。每个 key 记录所在行号,报告直接引用。

### 富文本与变量

- `<color=#FFD700>…</color>` `<size=20>…</size>` `<b>…</b>` `<icon=gold/>`(图标按 `字号 × 图标宽比` 占位)
- `{player}` `{count}` 等变量在检查时用工具栏配置的**最坏值**代入(最长玩家名、最大数字)

### 字体

**导入字体**可加载游戏的 TTF/OTF/WOFF,自动插到所有语言回退栈最前;
未导入时用各语言系统字体兜底。缺字形检测基于 `document.fonts.check` 逐字体查询。

## 排版保真怎么做

- **逐字形字体回退**:Canvas font stack 与 CSS 一样按字形回退,和游戏引擎的回退链一致
- **复杂文字 shaping**:泰语叠字、印地语合体字、阿语连写由浏览器 HarfBuzz 完成,
  `measureText` 测的就是 shaping 后的真实宽度(前提:与游戏用同一字体文件)
- **断行**:`Intl.Segmenter` 按语言规则给断点(泰语词典分词、CJK 任意断、西文按词)
- **RTL**:阿语界面 `direction: rtl`,行内 run 按视觉顺序重排,默认右对齐

## 检测规则

| 类型 | 判定 |
|---|---|
| 横向溢出 | 单行/最长行宽 > 内容区宽(已扣 padding) |
| 纵向溢出 | 行数超 `maxLines` 或总高超内容区,标记截断 |
| 控件交叠 | 文本**实际渲染矩形**(可能已超出声明框)与其他控件部分相交 |
| 缺字形 | 某字符在回退栈所有具体字体中都查不到 |
| 缺翻译 | key 不存在,或该语言列为空 |

## 已知限制 / 后续

- 跨 run 的双向文本(阿语+变色+图标混排)按 run 级反转近似,run 内由浏览器完整 bidi;
  如需像素级一致可引入 bidi 算法重排 run 顺序
- 目前检查在主线程分片跑;要再快可把 `runChecks` 挪进 Web Worker
  (OffscreenCanvas + FontFace 在 worker 均可用),按语言分 8 个 worker 线性加速
- 行高用 `字号 × 行距` 近似;若游戏用字体真实 ascent/descent,可换
  `measureText().fontBoundingBoxAscent/Descent` 逐字体累加
