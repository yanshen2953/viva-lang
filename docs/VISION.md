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
| 图表 | 轴、误差、分组、色标、投稿可读，由编译器长出来 | `chart.scatter/line/bar/heatmap/vector/funnel/box/violin` + 线性/log/band/time；轴标题在场景坐标；violin 为 KDE 轮廓 | 小栏宽间距仍粗；PDF CJK 子集有限；不是投稿成品 |
| 排版 | 作者只说「2×2 图、单栏 89 mm、安全框」；格子、出血、字幕条、对位由编译器算 | `layout.figure` 网格；`layout.board` 安全框 + `splits`；`unit: mm` + 单/双栏 | 无出血/裁切、字级网格、跨页、时间轴分镜 |
| 语法 | 原语极小，新能力只加插件名 | 核还算小；widget 走 `registerWidget()` | 语言表面没涨关键字。不要为图种/槽位加关键字 |
| 编译器 | 度量、避让、对齐、交互默认、导出保真全在编译/运行时 | band/log/linear + handbook 涂颜料 + 图核默认交互 | handbook **不**执行图语法；导出保真仍有缺口 |
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

有：节点可拖、碰撞、键盘、tick、图层；图表默认数据域 tooltip、brush 反演（按 frame 隔离，同名 xField 联动）、跨面板 group 高亮、点图例高亮。  
没有：动画过渡、内联卡上的检查/修复壳。`__sel.keys` 默认让其它面板 **藏行**（`link: dim` 可改回变淡），仍不是带过渡的完整 linked-view。

### 3.2 论文级图表

有：线性 / log / band / time 轴、scatter/line/bar/heatmap/vector/funnel/box、轴标题/单位、误差棒、热图色条、图例外置、投稿 mm、SVG 更接近 Runtime、PDF 随包 CJK 子集。  
没有：完整 CJK 字库、投稿级字距与出血。有 time / box / violin（KDE 轮廓）/ 显著性括号；轴刻度已离开数据域，改钉在图框外侧。小栏宽 mm 图默认不再画常驻 HUD 读数。

### 3.3 图像 / 视频级排版

有：`layout.figure` 网格 + `(a)(b)`；`layout.board` 的 `safe` / `title` / `body` / `lower` + `splits`；`unit: mm` + 栏宽。  
没有：字级网格、跨页。`layout.board` 已有 `splits` / `beats` 分镜槽，以及 `bleed`/`trim`/裁切十字。这些必须继续是**插件**，不能变成语法。时间分镜仍不是播放。

---

## 4. 和常见代理内联汇报比，现在赢在哪、装在哪

| | 别人 | 愿景中的 Viva | 现在的 Viva |
| --- | --- | --- | --- |
| 生成物 | matplotlib / React / 静态图 | 可编译的活汇报件 | 能编，默认观感仍粗 |
| 改法 | 改代码重跑 | 改意图、热替换 | patch/session 接口在，产品环不在 |
| 交互 | 图是附件 | 图就是世界 | 默认有刷选/高亮，仍不是游戏级汇报 |
| 排版 | 手调或 CSS | 编译器网格 / 安全框 | figure + board + mm，无分镜 |
| 扩展 | 再学一个库 | 注册插件 | 手册 + widget 注册表 |

未齐三柱质量之前，**不要**说超过 Claude Science，也不要说 Nature 级。

---

## 5. 下一刀（只服务三柱，不铺路由）

1. 投稿级留白 / 字距 / 出血（编译器，不加关键字）
2. brush 升级成可共享的数据域 selection，而不只是变淡
3. 扩大随包 CJK 子集
4. `layout.board play` 已能推进 `__beat` 并遮罩非当前拍；仍不是成片时间轴 / 导出视频
5. 例子与 exam 种子编译已进 CI；LLM 生成成功率仍未测。不要把 visual diagnostics 误报成「已经闭环」

发现插件：`viva widgets` 或 `listWidgets()`。
