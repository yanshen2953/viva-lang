# 终极愿景 vs 现在（对照）

北极星（用户原话，以此为准）：

> 一门**新的**、**语法和原语极简**、**复杂度交给编译器**、带**动态插件系统**、服务 **coding agent** 的**内联汇报语言**。  
> 同一套语言必须**同时**做到：
>
> 1. **游戏式丰富交互**
> 2. **论文级精美图表**
> 3. **图像 / 视频级排版**

默认内联体验仍是 `print-nature` + **可交互 Runtime**，不是一张静态 PNG。

本文只做对照。**不要**把接口齐当成愿景齐。

---

## 1. 愿景要的是一门语言，不是三套 demo

| 柱 | 愿景里的样子 | 今天实际 | 差在哪 |
| --- | --- | --- | --- |
| 交互 | 汇报件本身就是活世界：点、刷、拖、联动、时间，和游戏同一套原语 | Runtime 有 click/hover/drag/collide/key/tick；图表默认 `__tip` / `__hover` / `__brush`（数据域） / `__highlightGrp` | 刷选还不是完整 linked selection；无动画过渡；内联卡上的检查/修复壳仍弱 |
| 图表 | 轴、误差、分组、色标、投稿可读，由编译器长出来 | `chart.scatter/line/bar/heatmap/vector/funnel/box/violin` + 线性/log/band/time；轴标题在场景坐标；violin 为 KDE 轮廓；`print-nature` 接管刻度/轴标题字号与字距 | 小栏宽间距仍粗；CJK 子集扩大但仍不是全库；不是投稿成品 |
| 排版 | 作者只说「2×2 图、单栏 89 mm、安全框」；格子、出血、字幕条、对位由编译器算 | `layout.figure` 网格（不写 `inset*` 时按绑定 chart 估留白）；`layout.board` 安全框 + `splits` / `beats` / `bleed` / `typeGrid`（不写 `safe`/`titleH`/`lowerH` 时按题注和芯片估条带）；`unit: mm` + 单/双栏；`--beats` 出 PNG 序列，可选 ffmpeg 拼 GIF/MP4 幻灯 | 无跨页；估 inset ≠ 碰撞求解；`play` 仍是拍遮罩，不是成片时间轴 |
| 语法 | 原语极小，新能力只加插件名 | 核还算小；widget 走 `registerWidget()` | 语言表面没涨关键字。不要为图种/槽位加关键字 |
| 编译器 | 度量、避让、对齐、交互默认、导出保真全在编译/运行时 | band/log/linear + handbook 涂颜料/接管字号字距 + 图核默认交互 | handbook **仍不**执行图语法（避让、对齐、栏宽文法）；导出保真仍有缺口 |
| 插件 | 宿主运行时注册：图种、排版、领域视图，agent 可发现 | 手册 / 领域视图 / 结构宏都可注册 | 还不是热加载 / 沙箱包；未知 widget 编译失败并列出已注册名 |
| Agent | 内联写短意图 → 编译 → 交互卡 → 检查 → 补丁 | CLI / MCP / HTTP / SDK 能编能导；prompt 默认 slim；session compile 附带 visual diagnostics | 生成成功率未测；visual 不挡编译成功 |

一句话：今天是 **World + Space + Paint** 粘在一起，脊柱已能同时展开三柱，但出版观感与 agent 闭环都还没齐。愿景是 **同一套极小原语**，三柱都是编译器展开，插件只换展开器。

---

## 2. 为什么不能靠加关键字

错误路径（已经踩过苗头）：

- 为「像论文」加 `figure` / `panel` / `colorbar` 关键字
- 为「像视频」加 `safe` / `lowerThird` 关键字
- 为「像游戏」把每个玩法写成语法

正确路径（设计真源，见 `DESIGN.md`）：

```
作者 / agent 只写：世界是什么、数据是什么、用哪个插件宏
         ↓
   widget / handbook / domain view   ← 动态插件
         ↓
   Compiler 展开成 node / frame / event
         ↓
   Runtime 负责交互、度量、图层、时间
```

对齐这一条的具体动作：

- `registerWidget()` / `listWidgets()`（`src/plugins/registry.ts`）
- 内置插件：`timeline`、`chart.*`（含 vector/funnel）、`layout.figure`、`layout.board`
- 图表用 `panel: a` 吃排版插件吐出的 frame，不再强迫手写 `areaX/areaY`
- `layout.*` 先于 `chart.*` 展开，源码顺序无所谓

**没有**新增语言关键字。`widget layout.figure` 只是一个插件名。

---

## 3. 三柱各自还缺什么（按用户看得见的质量）

### 3.1 游戏式交互

有：节点可拖、碰撞、键盘、tick、图层；图表默认数据域 tooltip、brush 反演（按 frame 隔离，同名 xField 联动）、跨面板 group 高亮、点图例高亮。有效刷选松手后保持选择窗；拖路径明显长于对角时用套索，否则矩形。  
没有：完整游戏级过渡曲线。内联卡有只读结构检查条，仍无 visual/raster、也没有自动修复。`__sel.keys` 默认让其它面板 **藏行**（含 box / violin / 折线线段；`link: dim` 可改回变淡）。Runtime 用 CSS `opacity` + 命中组 `scale` 做 220ms 缓动（含 `layout.board play` 拍遮罩）；静态导出仍是硬切。不是时间轴。

### 3.2 论文级图表

有：线性 / log / band / time 轴、scatter/line/bar/heatmap/vector/funnel/box、轴标题/单位、误差棒、热图色条、图例外置、投稿 mm、SVG 更接近 Runtime、PDF 随包 CJK 子集（examples + 论文用字）。`print-nature` 会覆盖 widget 硬编码字号，刻度 8 / 轴标题 9 带字距。编译器按字号和 `unit: mm` 比例放置轴标题/刻度/图例；单图不写 `areaX`/`areaY` 时按场景估绘图区，避免小栏宽把标题推出画布。  
没有：完整 CJK 字库、通用排版求解（跨页、栏宽文法）。有 time / box / violin（KDE 轮廓）/ 显著性括号；轴刻度已离开数据域。chrome 盒子会互推一档（标题避开 `(a)`，y 轴标题避开刻度，图例避开色条）；图/轴标题按栏宽折行（最多三行；封顶后尾行 `...`；Y 轴 −90° 后从上往下读），图例键和色条标签按剩余栏宽折行（含连字符，最多两行；色条/右图例先让 inset，仍装不下才省略），热图可用 `zLabel`/`zUnit`，重叠刻度抽稀，相邻格 chrome 互叠时再长 inset。仍不是 InDesign。小栏宽 mm 图默认不再画常驻 HUD 读数。

### 3.3 图像 / 视频级排版

有：`layout.figure` 网格 + `(a)(b)` + 格子甲板；不写 `inset*` 时编译器按该格 chart 的刻度/标题/图例/色条迭代估留白；不写 `x/y/w/h` 时铺满场景，或 `panel: body` 吃 board 槽；`title`/`subtitle`/`caption` 由编译器画；两张以上未绑 panel 的 chart 自动成网格；`layout.board` 的 `safe` / `title` / `body` / `lower` + 题注属性 + `splits` / `beats` / `bleed` / `typeGrid`；不写 `safe`/`titleH`/`lowerH` 时按题注折行和芯片宽度估条带（仍不是 InDesign）；`unit: mm` + 栏宽；CLI/MCP/HTTP `--beats` 按 `__beat` 导出 PNG 序列，`-f gif|mp4` 用 ffmpeg 把这些栅格拼成幻灯（2 fps，不是时间轴 / 成片）。  
没有：跨页、剪辑时间轴、真正的碰撞求解。`typeGrid` 是安全框上的基线与 `type0`… 栏，不是 InDesign 级网格系统。这些必须继续是**插件**，不能变成语法。`play` 仍是拍遮罩。

---

## 4. 和常见代理内联汇报比，现在赢在哪、装在哪

| | 别人 | 愿景中的 Viva | 现在的 Viva |
| --- | --- | --- | --- |
| 生成物 | matplotlib / React / 静态图 | 可编译的活汇报件 | 能编，默认观感仍粗 |
| 改法 | 改代码重跑 | 改意图、热替换 | patch/session 接口在，产品环不在 |
| 交互 | 图是附件 | 图就是世界 | 默认有刷选/高亮，仍不是游戏级汇报 |
| 排版 | 手调或 CSS | 编译器网格 / 安全框 | figure + board + mm + bleed/typeGrid；无跨页成片 |
| 扩展 | 再学一个库 | 注册插件 | 手册 + widget 注册表 |

未齐三柱质量之前，**不要**说超过 Claude Science，也不要说 Nature 级。

---

## 5. 下一刀（只服务三柱，不铺路由）

1. 跨页 / 栏宽文法（`layout.figure` 省略 gutter/margin/titleH 时按 mm/像素估缝和题注带；图/轴标题、图例键和色条标签已按栏宽折行，封顶后尾行省略，重叠刻度会抽稀，相邻格会再让 inset；软顶装不下时 inset 可再长到约半格，还不是通用排版器）
2. `__sel` 已是共享 key 集并藏行；高亮和 play 遮罩走 CSS opacity/scale 220ms，仍缺时间轴和按行摘要图种过滤
3. 再扩 CJK 或允许宿主挂全库；缺字仍可能 `?`
4. `layout.board play` / `typeGrid` 已在；省略 `safe`/`titleH`/`lowerH` 时按题注估条带；`--beats` 默认 PNG 序列，`-f gif|mp4` 只是 ffmpeg 幻灯，不是成片时间轴
5. 例子与 exam 种子编译已进 CI；LLM 生成成功率仍未测。不要把 visual diagnostics 误报成「已经闭环」

发现插件：`viva widgets` 或 `listWidgets()`。
