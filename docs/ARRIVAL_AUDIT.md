# 到站系统审计

评估时间：2026-08-24。评估对象：`cursor/world-hand-f1b5`，第一轮文档提交 `7bcebf5`；其后的第二轮为独立代码复核和本机诊断。

北极星：一门极小、内联、服务 coding agent 的汇报语言；同一套 World / Space / Paint 原语同时覆盖活世界交互、论文图和影像排版。复杂度在编译器 / Runtime / 插件里，不靠增加语言关键字。

## 结论

**尚未到站。**

当前实现是一个有真实脊柱的原型：Viva 源码能编成 IR，图表、排版、Runtime、矢量 PDF、MCP、确定性 repair 都有可运行实现。但四道门仍是不同例子分别通过低层断言，尚无一份极小源码在真实渲染、真实指针和真实 agent 闭环中连续通过。

`npm test` 绿色只表示回归地板没有倒退，不能推出：

- 间距达到印刷质量；
- Runtime 与 PDF 同画面；
- 手势在一个浏览器会话中保持状态；
- agent 能从短意图生成并修好一张可玩的卡。

本文只以代码、实际渲染和可重复测试为证。功能名称、接口存在、IR 字段存在不算到站。

## 第一轮审计纠错

### 1. Clock 成片不是一拍一张

`play: true` 时，Runtime 和 gif/mp4 共用 `applyTimelineState()`：

- `exportBeatSequence()` 用 `holdFrameTimes()`，每拍取一个 hold 中点，用于 PNG 拍序列；
- `exportBeatPlayback()` 用 `playbackFrameTimes()`，按 `timeline.fps` 采完整 hold + ease 周期；
- `exportBeatAnimation()` 在有 timeline 时用 playback 帧交给 ffmpeg。

因此，有 timeline 的 gif/mp4 是离散采样的 Clock 回放，不是简单拍幻灯。部分工具说明和旧文档仍把它写成 slideshow，需要统一。

### 2. 原「眼睛门」是假绿

`tests/exam/four-gates.test.ts` 目前只锁：

- 89 / 183 mm 场景的 SVG viewBox 与 PDF 页尺寸一致；
- `paper-cjk` 的 `missingGlyphs` 为空；
- 固定例子能编译并产生若干预期结构。

它没有证明 SVG 和 PDF 画面一致。当前矢量 PDF 不处理 `rotate`，而：

- `paper-cjk` 有旋转 −90° 的 Y 轴标题；
- `figure-atlas` 有旋转 −90° 的色条标题和 Y 轴标题。

屏幕上竖排的标题在 PDF 中会横排并错位。页宽相同不能算通过眼睛门或导出门。

## 四道门现状

| 门 | 用户可见标准 | 当前能证明 | 不能证明 / 明确缺失 | 状态 |
| --- | --- | --- | --- | --- |
| 眼睛 | Atlas、paper-column、paper-cjk、storyboard；89 / 183 mm；屏幕与 PDF 并排；间距像印的 | mm 尺寸、基本 chrome 盒、CJK 示例字可导出 | 真实字体度量；SVG/PDF 画面同构；印刷间距尺；Atlas 仍是 1360×920 px 工作室 | **未过** |
| 手 | 刷、拖、翻拍、跳页；状态不断；暗拍可刷 | `simulate()` 可打编译生成的 brush/hover/click；World 手的几何纯函数有单测；暗拍遮罩不抢指针 | 一个真浏览器会话；pointer capture / slop / DOM 命中 / `__hand` / CSS ease；Runtime 页面导航不存在 | **未过** |
| 导出 | 矢量 PDF 有字；成片跟 Clock；`data-viva-id` 对 Runtime | 已知 CJK 示例能生成 PDF（覆盖未证）；Clock playback；Runtime / SVG 已画节点的 ID 规则一致 | PDF 丢旋转、渐变、虚线、圆角、字距、填充 path 和分页 clip；PDF 无节点 ID；隐藏节点契约未统一 | **未过** |
| agent | 短意图 → MCP 编 → 失败自修 → 卡上可玩；不把文档糊进 prompt | MCP / session / embed / prompt / checks / repair 组件存在；hard exam 可运行 | 产品内无闭环 orchestrator；repair 很窄且一轮；hard exam 注入整本 LANGUAGE；不判印刷、行为或卡 | **未过** |

## 根因一：排版用的不是最终字体

### 三把互不相同的尺

1. 布局和结构检查：`estimateTextWidthPx()`。
2. Runtime / SVG：默认 `IBM Plex Sans, sans-serif`，由浏览器字体栈排字。
3. PDF：Latin 用 Helvetica，CJK 用宿主 / 环境 / 随包字体，调用 fontkit 真宽度。

`estimateTextWidthPx()` 的实现只有两档：

```ts
ch >= U+3000 ? font : font * 0.58
```

每个字符再加固定 tracking。它不区分 `i`、`W`、数字和标点，也不读取实际字体。

用当前 PDF 字体实测：

| 文本 | 估算宽 | PDF 真宽 | 误差 |
| --- | ---: | ---: | ---: |
| `Response`（9） | 41.8 | 40.5 | +3% |
| `Sum score`（9） | 47.0 | 43.0 | +9% |
| `Visit`（8） | 23.2 | 15.1 | +54% |
| `WWWWWWWW`（8） | 37.1 | 60.4 | −39% |
| `iiiiiiii`（8） | 37.1 | 14.2 | +161% |
| `0.25`（8） | 18.6 | 15.6 | +19% |
| `Time (week)`（9） | 57.4 | 49.4 | +16% |
| `心率 (次每分)`（9） | 60.7 | 65.4 | −7% |

这会直接改变：

- title / axis / legend / colorbar 的折行；
- ellipsis 触发点；
- inset 增长量；
- 刻度抽稀；
- 相邻 panel chrome 是否相撞；
- 绘图区剩余面积。

因此当前无法对「间距像印的」做可信验收。结构检查与布局共用同一把假尺，只能证明算法与自己一致，不能证明最终渲染正确。

### 排版算法的真实性质

当前不是通用约束求解器，而是有限轮启发式：

- `solveChartInsets()`：place → 算溢出 → 长 inset，单图默认最多 16 轮，多 panel 8 轮；
- `placePaperChrome()`：wrap + 位姿残差，最多 6 轮；
- 触底后保最小绘图区、抽稀刻度、折行或省略；
- structural `chromeOverflow` 是 warning，不会挡成功。

这套方法可以继续使用，但必须以真实字体盒和最终渲染误差作为反馈，否则只是稳定的估计器。

另有一个单位不安全的兜底：`src/widgets.ts` 的空 panel inset 是 `{ l: 76, r: 32, t: 32, b: 52 }`，直接作为 scene units 返回。px 场景尚可，89 mm 场景若走到该分支，左 inset 会成为 76 mm。

## 根因二：矢量 PDF 是 SVG 功能子集

SVG / Runtime 与 PDF 共用 `flattenNodesFromIr()`，所以基础节点坐标来自同一 IR；但 paint 后端不等价。

| 能力 | Runtime / static SVG | vector PDF | 后果 |
| --- | --- | --- | --- |
| 文字旋转 | 支持 `rotate(...)` | 不支持 | Y / Z 标题方向和位置错误 |
| letter spacing | 支持 | 不支持 | 字宽与 chrome 留白进一步漂移 |
| 渐变 | static SVG 支持 | 不支持 | 连续色条等退化为纯色 / 错色 |
| 虚线 | 支持 | 不支持 | 网格、参考线、边界不同 |
| 圆角 | SVG `rx` | 不支持 | dashboard 卡片 / 柱外观不同 |
| path | 浏览器按 SVG path 画 | 只解析 M / L 并画折线 | C / Q / A、闭合填充和复杂轮廓丢失 |
| filter / glow / blend | Runtime 支持部分 | 不支持 | 合成效果不一致 |
| text baseline | 浏览器字体引擎 | PDF 额外减 `size * 0.15` | 垂直位置漂移 |

当前「矢量 PDF」只说明不是 PNG 嵌入，不等于视觉保真。

第二轮复核又确认三条更硬的洞：

1. **path 不是“近似得差一点”**：PDF 只把 M / L 点连成 stroke，忽略 `Z` 和 fill。闭合小提琴 / 漏斗会从填充面退化成开口线框。
2. **分页没有 clip**：每页先用 `nodeHitsSlice()` 粗判节点，再直接画到整页；path 没有可识别 y / h 时会命中每一页。跨页的 full-height plate 也会在相邻页重复绘制。PDF 页数和页尺寸正确，不等于切片内容正确。
3. **PDF 没有节点 ID**：Runtime / static SVG 使用 `data-viva-id`，review 保存逻辑 ID；PDF 没有结构树、sidecar 或节点 bbox metadata。当前 ID 测试从未覆盖 PDF。

### `missingGlyphs` 不能证明 CJK 字形存在

`pdfMissingGlyphs()` 只是在每个字符上调用 `font.widthOfTextAtSize()` 并捕获异常。嵌入字体对 `.notdef` 字形也能返回宽度，不会抛错。

用随包 fallback 字体实测：

| 字符 | 返回宽度 | `missingGlyphs` | `pdfSafeText` |
| --- | ---: | --- | --- |
| `心` | 10 | `[]` | `心` |
| `𠮷` | 10 | `[]` | `𠮷` |
| `😀` | 10 | `[]` | `😀` |
| U+FFFF | 10 | `[]` | 原字符 |

因此 `paper-cjk` 的空缺字表只能证明测宽没抛错。可信验收需要检查真实 glyph 映射 / outline，或栅格化 PDF 后做文本提取与关键字 / OCR 对照。

## 根因三：手的主要断言没有经过 Runtime

`src/simulate.ts` 能执行 IR 中的 event body，因此适合检查：

- `__sel` / `__brush`；
- `__hover` / `__tip` / `__highlightGrp`；
- 作者 click / drag / key / collide 处理逻辑；
- 离散 beat 状态。

它不会走：

- DOM `closest("[data-viva-id]")` 命中；
- pointer capture / release；
- 世界拖拽 slop；
- `state.__hand`、编组位移、扫掠碰撞、套索橡皮筋；
- window / SVG 键盘焦点；
- 连续 wall-clock play；
- 220ms CSS / 几何缓动；
- enter animation。

仓库已有 `puppeteer-core` 和 `scripts/test-arena-ui.mjs` 等手工脚本，可以真实拖鼠标、按键、截图；但 `tests/` 没有浏览器 Runtime 测试，CI 也不运行这些脚本。

第二轮在 Runtime 接线上确认了四个具体问题：

1. **mm World 碰撞混单位**：flatten 后的 `node.props.x/y/r/w/h` 是 viewBox px；指针拖拽的 `drag.lastX/lastY` 是作者 scene units。`sharedWorldStep()` 用 scene-unit x/y 覆盖节点，却保留 px 的 r/w/h，再与全 px 的墙碰撞。px Arena 正常不代表 mm 到站件正确。`fireCollision()` 还把 px `node.props.x/y` 直接发给声明为作者场景单位的 `__event.x/y`。
2. **碰撞 phase 没有作者级完整语义**：作者 `event collide` 只在 enter 被调用；stay / leave 只写 `__hand.phase`，从不执行 handler。要么文档明确 collide 只表示 enter，要么新增不破坏 E5 一次计数的 phase 事件契约。
3. **刷选从 mark 上起不来**：plotBg 在 mark 下层；pointerdown 取最上层 `data-viva-id`。默认 mark 有 hover，因而被当作 hand subject，但没有 drag handler，也不会退回底下 plotBg。用户必须从空白绘图区开始刷。
4. **分页装饰能挡命中**：`__page_folio*` 和 veil 被忽略，但 `__page_jump_*` / chapter 节点既没有真实 handler，也未全部设为 pointer-ignored。

### `__page` 不是页面交互

分页目前是排版 / 导出能力：

- figure 避页刀；
- PDF 按页切片；
- folio / running head 是静态节点。

`view-machine.ts` 会从 `state.__page`、`__sel.page` 或 `__brush.page` 读取页号，但源码中没有实际页面导航写入者。`__page_jump_*` 是装饰文字，没有 click handler。因此「跳页」不是未测试，而是 Runtime 功能尚未实现。

## 根因四：Agent 组件没有组成产品闭环

当前真实链路：

```text
外部 LLM / exam runner
  → MCP / session compile
  → compileSource
  → 有 IR 时做一轮确定性 repair
  → 再编一次
  → 可选 raster / structural check
  → 有 mount 时挂 Runtime
```

仓库内没有统一的：

```text
短意图 → LLM → compile → 根据失败自动再提示 → 重编 → 视觉 / 行为验收 → 内联卡
```

### repair 的实际覆盖面

会改源码的规则只有：

- chrome overflow 时删除手写 `areaX` / `areaY` / inset / plotPad；
- empty panel 时补首个声明 data 的 `data:`；
- 单 chart + 多栏时把 `cols` 收成 1；
- axis 问题时删除手写 tick；
- 按 `xField` / `yField` 补 `xLabel` / `yLabel`。

其它分支只是 hint。它不修：

- `widget:` / `state:` 这类 YAML 写法；
- 嵌套 widget / frame；
- 缩进和截断赋值；
- 错字段、错 frame、错 event；
- timeline / rule / tick 结构；
- 逻辑或交互错误；
- 没有 IR 的语法失败。

session 最多做一轮确定性 repair，而且只有第一次编译已经得到 IR 才进入 repair。

### prompt 和 exam 与产品路径不一致

运行时字符串长度：

| 内容 | 字符数 |
| --- | ---: |
| `SYSTEM_PROMPT_SLIM` | 7,872 |
| `SYSTEM_PROMPT` | 5,728 |
| `docs/LANGUAGE.md` | 9,468 |
| hard exam 基础 system（slim + LANGUAGE） | 17,369 |

所谓 slim 比 full 大 37%，本身已经是一份密集语言参考。hard exam 再追加完整 `LANGUAGE.md`；MCP 默认 prompt 不追加。考试和产品 prompt 不同，也不满足「不靠把文档糊进 prompt」。

hard H01–H08 主要判：

- 源码正则；
- 是否编译；
- IR frame / layer / event / tick / rule / data / state 的数量或存在；
- session 是否接受；
- provenance 是否有记录。

它们不判：

- 89 / 183 mm 与 PDF；
- SVG / PDF 视觉一致；
- 真指针交互；
- Clock 成片；
- 内联卡；
- agent 输出是否通过四道门。

因此 hard 8/8 是语言生成 / 结构地板，不是到站率。

## 根因五：注册表是真，布局插件边界不真

词法 / parser 核仍不算大：lexer 有 29 个关键字，作者常用的顶层声明约 15 类；图种、槽位和栏宽仍是 widget / property，不是新增关键字。

但「没加关键字」不等于有效语言表面小。当前还有一套影子语法：

- lexer 保留 `resource`，parser 却把它当未知 declaration；`event TYPE` 允许任意名字，但 Runtime 只派发固定事件；
- `role: panel|plot` 会把普通 node 提升为 frame；
- `panel:` / `frame:` 改变 slot ownership；
- 两张未绑定 chart 会隐式插入 figure；
- board / figure / chart 有大量 property alias；
- 编译器注入 `__sel` / `__brush` / `__beat` / `__timeline` / `__veilN` 等状态；
- `widgets.ts` 约 6,000 行，把 chart、figure、board、folio、newspaper、World 交互绑在同一个固定流水线。

`registerWidget()` 对简单插件是真实的；但外部插件无法注册与 built-in 同等的 expand 生命周期。`expandWidgets()` 强制 board → figure → 其它顺序，并在所有插件之后硬跑：

- framed World layer lift；
- play layer lift；
- page folio；
- slot fill / frame promotion；
- World 交互绑定；
- plot chrome；
- newspaper reflow。

这些 post-pass 没有 hook API。`layout.figure` / `layout.board` 是“以 widget 名义进入的核心编译器功能”，不是可由第三方等价替换的动态布局插件。

一份到站件还暴露 slot 冲突：`layout.board beats` 把 body 切成 `beat0…`，而 Atlas 模式让 `layout.figure panel: body` 占据同一个 body。两套模式都能单独工作，但谁拥有 body、veil 是否盖住 figure、跨页后如何延伸，目前没有组合契约。

## 根因六：发布与浏览器产品在 CI 之外，而且当前是红的

第二轮本机复现：

| 诊断 | 结果 | 根因 |
| --- | --- | --- |
| `npm run build:lib` | 通过 | 只编 `src/` TypeScript |
| `npm run build` | **失败** | playground 从 `src/agent` barrel 拉入 HTTP / resvg / sharp，Vite 尝试解析 native `.node` |
| `vite build --config vite.embed.config.ts` | **失败** | embed → session → vector-pdf → pdf-font，引入 `node:fs/path/url` |
| `tsc -p tsconfig.json --noEmit` | **失败** | 测试 SVG 类型、readonly handbook 数组、cancel test 等类型债 |

当前 GitHub CI 只跑：

- `npm ci`；
- `build:lib`；
- Vitest；
- 固定例子的 CLI raster visual；
- prompt 字符串 smoke。

它不跑：

- 完整 playground / embed build；
- Puppeteer Runtime；
- agent exam；
- npm pack / 安装后 smoke；
- Docker CJK export；
- SVG↔PDF 视觉差；
- browser inline card。

发布面还有两个明确断口：

1. `dist/embed/web.js` 是 tsc 模块，但 HTTP server 承诺的 `dist/embed/viva-embed.js` / IIFE 只有失败的 Vite build 才会生成；当前 npm 包没有这两个 bundle。
2. Dockerfile 复制 `dist` / `docs` / `examples`，没有复制 `assets`，所以镜像里随包 CJK 字体不可见，除非宿主另挂字体。

因此「卡上可玩」不仅没考，默认浏览器构建本身尚不能发布。

## 到站需要的十个工作包

按依赖关系排序，不按日历估时。

### P0-A：统一字体和文本度量

做什么：

- 确定一套随包 Latin + CJK 字体资产和字体角色；
- 给 layout / structural / SVG / PDF 共用一个真实 `measureText` 接口；
- 清除 `0.58 * font` 作为发布布局依据；
- 让 board、figure、chrome、node bbox、PDF alignment 使用同一套 metrics。

验收：

- 上表的极宽 / 极窄 / 数字 / 混合 CJK 样本按实际字体测量；
- layout 预测 bbox 与浏览器 `getBBox()`、PDF 真宽误差有硬阈值；
- 89 / 183 mm fixture 不靠额外 12 px 容差掩盖错误。

### P0-B：补齐 PDF paint 保真

做什么：

- text rotate / letterSpacing / baseline；
- dash / radius / gradient；
- 完整 path（至少 M/L/H/V/C/Q/Z 与 fill / stroke）；
- 给每个 PDF page 建真实 clip，按旋转 / path / radius 后的 bbox 决定切片，不重复跨页 plate；
- 用 glyph cmap / outline 或 PDF 文本提取 + raster/OCR 验证 CJK，不再把 `missingGlyphs=[]` 当覆盖证明；
- 明确 filter / blend 的矢量支持或可见降级策略。

验收：

- 同一到站件的 Runtime SVG、static SVG、vector PDF 做每页、每角色的结构 bbox + ink mask / SSIM 叠差，而不是只比全图原始 RGB；
- rotated Y / Z title、连续色条、虚线、圆角和小提琴轮廓有专项 fixture；
- page 2 不重复 page 1 的 plate/path；关键 CJK 文本能从 PDF 提取或 OCR 命中；
- 不允许用页宽相等代替画面相等。

### P0-C：一份规范到站件

做什么：

- 一份短源码同时包含：A4 / 183 mm text block、89 mm panel、CJK、足够异质的图、一个可拖 World 对象、brush、四拍 play、跨页；
- `scene.column` 是全局值，因此 89 / 183 mm 必须通过 double-column 内的 span:1 / span:2 表现，不是假装同一 scene 有两个 column mode；
- 先明确 board `beats` 与 `layout.figure panel: body` 的 slot ownership / veil / 跨页组合契约，再写 fixture；
- 不加语言关键字，能力来自现有 scene 属性和 widget 插件。

验收：

- 四道门只接受该源码；
- fixture 不含 `areaX` / `areaY` / 手写 inset / 手摆轴 / 手摆页码；
- 删除旧的「四份示例各证明一角」替代判据。

### P0-D：统一 Runtime 世界坐标与指针契约

做什么：

- hand / collision 的 shape、origin、wall、depth 全部统一在作者 scene units 或 viewBox px，不能混用；
- collide payload 的 `x/y/nx/ny` 明确单位，并决定 `collide` 只表示 enter 还是向作者暴露 stay / leave；
- 让从 mark 中心开始的 brush 能落到 plot hand，不要求用户找空白；
- 定义同一 frame 上 chart brush 与 World drag 的优先级；
- 给 folio / chapter / jump 节点明确 pointer policy。

验收：

- mm 两固体拖撞、滑墙、编组测试与 px Arena 语义一致；
- `__event.x/y` 在 mm 场景仍是 mm；
- 浏览器从 mark 上起刷与从空白处起刷结果一致；
- E5 enter 一次计数不倒退，同时 phase 契约有专项测试。

### P0-E：修通完整浏览器构建与发布包

做什么：

- 拆 browser-safe host/session 依赖图，playground 不再经 agent barrel 拉 Node HTTP / sharp / resvg；
- embed 不再静态 import vector PDF / Node font resolver；
- `npm run build` 同时产出 playground、`viva-embed.js` 和 IIFE；
- Docker 复制字体 / assets；
- npm pack、Docker 和安装脚本都做干净环境 smoke。

验收：

- `npm run build` 通过；
- 安装 tgz 后 CLI、MCP、CJK PDF、`/embed/viva-embed.js` 都可用；
- 容器内不依赖宿主字体也能导出已声明支持的 CJK；
- CI 不再用 `build:lib` 绿色掩盖浏览器产品红色。

### P1-F：真实 Runtime 浏览器考试

做什么：

- 从现有 Puppeteer 脚本抽共享 server / page / pointer / screenshot fixture；
- 接入自动测试；
- 增加只读 `InteractionSnapshot` / frame flush 测试 API，稳定读取 hover、press、drag 和 `__*` state，不靠 HUD 文本猜状态；
- 在一个页面、一次 session 中：brush → World drag → `n` / `N` 翻拍 → 页面跳转 → 暗拍再刷；
- 每步读取并断言 `__sel` / `__brush` / `__hand` / `__beat` / `__page`。

验收：

- 真实 pointer capture、DOM hit testing、keyboard focus、连续 clock 被覆盖；
- 录屏 / 关键帧作为 walkthrough artifact；
- 失败不是通过直接调用 `simulate()` 绕过。

### P1-G：真正的 Runtime 页面导航

做什么：

- 定义页面状态与视口行为；
- 给页导航节点真实 click / key handler；
- `__page` 成为一个有写入者的 Runtime state；
- 页面切换时保持 brush / selection / beat / hand 状态。

验收：

- 浏览器考试中页号、视口、folio 和 `__view.phase` 同步；
- page jump 不是滚动截图或直接写 state；
- 静态 PDF 分页与 Runtime 页边界引用同一 page model。

### P1-H：关闭 Agent 环

做什么：

- 让产品和 exam 走同一个 prompt 服务；
- 把 slim 缩成语法骨架 + 能力发现，不内嵌完整语言手册；
- 建立有上限的 compile/check/repair/re-prompt orchestrator；
- 无 IR 的 parser / syntax 诊断也能进入 LLM 修复；
- 最终挂真实 inline Runtime，而不是只返回 IR。

验收：

- 短意图在不追加 `LANGUAGE.md` 的条件下生成 P0-C 到站件；
- 第一次故意失败后，诊断触发修复并再次过四门；
- agent exam 判视觉、PDF、行为和卡，不只判源码正则 / IR 计数；
- 保存每轮 prompt digest、源码、诊断、repair 和最终 artifact。

### P1-I：把 widget 注册表升级成可组合插件生命周期

做什么：

- 将 `widgets.ts` 中 folio / reflow / world-bind / chrome 等固定 post-pass 拆成有顺序和依赖声明的 hook；
- external plugin 能注册 expand 阶段和必要后处理，而不是只能 push layer/frame；
- handbook 统一注册 prose + preset，明确它只控制 paint/policy 还是也能提供 layout hook；
- 记录并测试隐式 figure、role/frame promotion、property alias 等影子语法；
- 定义 board beats、figure、splits 和 page 对同一 slot 的所有权。

验收：

- 一个仓库外插件不改 core 即可新增 layout，并参与 page / folio / interaction 生命周期；
- 插件顺序由声明式依赖决定，不靠 widget 名称硬编码；
- 未注册的 post-pass 不能静默改外部插件产物；
- agent 可从能力发现拿到插件 schema，不靠把全部 property 写进 system prompt。

### P2-J：统一 ID 与隐藏节点契约

做什么：

- 明确 `data-viva-id` 是全部逻辑节点，还是只包含当前 painted 节点；
- Runtime、static SVG、review/selectable node 使用同一 logical / painted 约定；
- PDF 选择结构树或 sidecar `{ id, page, bboxPt }`；不能宣称不存在的 `data-viva-id`；
- hand overlay 等 Runtime-only UI 使用独立 namespace，不冒充作者节点。

验收：

- visible / opacity / ease 中间态都有定义；
- 导出和 Runtime 的 ID 集可以直接比较，不需要测试临时过滤 `nodePainted()` 才通过。

## 依赖图

```text
真实字体度量 ──────┐
                   ├─> SVG/PDF 画面同构 ──> 眼睛门 / 导出门
PDF paint + clip ───┘

slot / 插件组合契约 ─> 规范到站件 ─┬─> 浏览器 Runtime 考试 ──> 手门
                                  ├─> PDF 视觉门 ───────────> 眼睛 / 导出门
                                  └─> Agent 闭环考试 ───────> agent 门

Runtime 单位 / 指针 ──────────────> 浏览器 Runtime 考试
Runtime page model ───────────────> 浏览器 Runtime 考试
browser build / embed / pack ─────> 浏览器 Runtime 考试 / agent 卡

ID 契约 / PDF sidecar ────────────> 导出门 / review / agent artifact
```

最先阻断执行的五项是：

1. 真实字体度量；
2. PDF paint + page clip + CJK 真覆盖；
3. Runtime 世界坐标 / brush 命中；
4. 完整浏览器 build / embed / package；
5. slot 组合契约与一份规范到站件。

它们没完成之前，不应把时间花在继续增加图种、MCP 路由或语言关键字上。

## 到站测试矩阵

### 每次合并必须过

| Job | 内容 | 防止的假绿 |
| --- | --- | --- |
| lib + full browser build | `build:lib`、playground Vite、embed ES/IIFE | 库能编但卡不能发布 |
| deterministic | corpus / parser / host / clock / hand pure tests | 基础语义回归 |
| package smoke | tgz 干净安装；CLI / MCP / CJK PDF / embed fetch | checkout 能跑、发布包缺文件 |
| PDF structural | 每页节点 bbox / clip / text extraction / path fill | 页宽对但内容错 |
| browser Runtime smoke | 真 pointer brush + World drag + beat key；读 InteractionSnapshot | `simulate()` 绿但手坏 |
| prompt contract | 产品与 exam prompt hash / capability schema 一致 | hard exam 走另一份大 prompt |

### 固定环境的重型门

| Job | 内容 | 频率 |
| --- | --- | --- |
| SVG↔PDF visual | 300 DPI 每页 ink mask / SSIM + rotate / gradient / path role checks | 每日或发布前；核心 paint 变更时必跑 |
| 完整浏览器到站链 | brush → drag → beat → page → 暗拍 brush + 视频 | 每日或发布前；Runtime 变更时必跑 |
| Docker smoke | health + 容器内 CJK PDF + embed bundle | 发布前 |
| pinned agent exam | 产品 prompt、短意图、失败再修、四门判分、内联卡 | 有模型密钥时每日；发布前必跑 |
| vision exam | 固定模型槽与 golden rubric | 发布前，不替代确定性门 |

`tests/exam/four-gates.test.ts` 中“not arrived”是一个永真说明性断言，不是验收门；当上述矩阵落地后应删掉，而不是继续扩大这类 meta-test。

## 最终到站定义

只能在以下条件同时成立时说「到站」：

1. 同一份短 Viva 源码经过 `print-nature` 编译；
2. 同一件中出现 89 mm 单栏与 183 mm 跨栏内容；
3. Runtime SVG 与 vector PDF 的关键画面通过栅格叠差和 mm 间距断言；
4. PDF 的真实 glyph / text extraction 无预期外缺字，旋转标题、色条、分页 clip、填充路径和字距正确；
5. 一个真实浏览器 session 连续完成 brush、World drag、翻拍、跳页、暗拍 brush，状态不断；
6. gif/mp4 使用同一 Clock 的 playback samples；
7. logical / painted / ephemeral ID 契约在 Runtime / SVG / PDF sidecar / review 一致；
8. 完整 playground / browser embed / npm package / Docker smoke 通过；
9. 一个外部 widget / handbook bundle 不改 core 即可注册并进入声明式 expand 生命周期；
10. agent 只收到真正 slim prompt 和能力发现，从短意图生成该件，失败后自动修复，并在内联卡上通过 1–9。

这一定义不等于 Unity、Nature 投稿认证或超过 Claude Science；它只表示 Viva 自己承诺的四道门已经真实闭合。
