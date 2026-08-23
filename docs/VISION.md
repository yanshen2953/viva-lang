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
| 交互 | 汇报件本身就是活世界：点、刷、拖、联动、时间，和游戏同一套原语 | Runtime 有 click/hover/drag/collide/key/tick；图表默认只多了 `__tip` 字符串 | 交互是游戏栈；图是另一套宏。没有「刷选 / 跨面板高亮 / 数据域 tooltip」这种汇报交互 |
| 图表 | 轴、误差、分组、色标、投稿可读，由编译器长出来 | `chart.scatter/line/bar/heatmap` + 线性 `frame`；轴标题/误差/热图刚补上 | 无 log/时间/分类轴；无 box/violin；图例仍在图内；PDF 仍 Helvetica，CJK → `?` |
| 排版 | 作者只说「2×2 图、单栏 89 mm、安全框」；格子、出血、字幕条、对位由编译器算 | 多面板靠 `areaX/areaY` 魔法数；Atlas (d)(e)(f) 手摆 | **没有图像/视频构图层**。本轮补了 `layout.figure` 网格（插件，不是新关键字），仍无 mm/栏宽/16:9 安全区 |
| 语法 | 原语极小，新能力只加插件名 | 核还算小；widget 曾是 `expandWidgets` 里的硬编码 `switch` | 本轮改成 `registerWidget()`。语言表面没涨关键字 |
| 编译器 | 度量、避让、对齐、交互默认、导出保真全在编译/运行时 | 线性 scale + handbook 涂颜料 + 部分图核 | handbook **不**执行图语法；导出 ≠ 预览 |
| 插件 | 宿主运行时注册：图种、排版、领域视图，agent 可发现 | 风格手册可注册；领域视图可注册；**结构宏直到本轮才可注册** | 还不是热加载 / 沙箱包；未知 widget 现在会编译失败并列出已注册名 |
| Agent | 内联写短意图 → 编译 → 交互卡 → 检查 → 补丁 | CLI / MCP / HTTP / SDK 能编能导 | session 默认只做结构启发式；LLM 默认 prompt 仍偏玩具模板 |

一句话：今天是 **World 演示 + Space 骨架 + Paint 手册** 粘在一起。愿景是 **同一套极小原语**，三柱都是编译器展开，插件只换展开器。

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

本轮对齐这一条的具体动作：

- `registerWidget()` / `listWidgets()`（`src/plugins/registry.ts`）
- 内置插件：`timeline`、`chart.*`、`layout.figure`
- 图表用 `panel: a` 吃排版插件吐出的 frame，不再强迫手写 `areaX/areaY`
- `layout.*` 先于 `chart.*` 展开，源码顺序无所谓

**没有**新增语言关键字。`widget layout.figure` 只是一个插件名。

---

## 3. 三柱各自还缺什么（按用户看得见的质量）

### 3.1 游戏式交互

有：节点可拖、碰撞、键盘、tick、图层、Arena/Atelier 示例。  
没有：图表作为一等交互对象（刷选、联动、动画过渡）、HUD 与数据域的统一、内联卡上的检查/修复壳。

### 3.2 论文级图表

有：线性 frame、四类 chart 宏、轴标题/单位、误差棒、热图色条、默认 hover、SVG 更接近 Runtime。  
没有：投稿尺寸（89 / 183 mm）、PDF/CJK、统计图种、图外图例、显著性、Atlas 后三格仍手摆。

### 3.3 图像 / 视频级排版

有（本轮）：`layout.figure` — `cols/rows/gutter/margin/inset*`，自动 `(a)(b)(c)`，图表 `panel:` 对位。  
没有：`layout.board`（16:9 安全框、字幕条、分屏）、出血/裁切、字级网格、跨页、时间轴分镜。这些必须继续是**插件**，不能变成语法。

---

## 4. 和常见代理内联汇报比，现在赢在哪、装在哪

| | 别人 | 愿景中的 Viva | 现在的 Viva |
| --- | --- | --- | --- |
| 生成物 | matplotlib / React / 静态图 | 可编译的活汇报件 | 能编，默认观感仍粗 |
| 改法 | 改代码重跑 | 改意图、热替换 | patch/session 接口在，产品环不在 |
| 交互 | 图是附件 | 图就是世界 | 游戏示例强，汇报默认弱 |
| 排版 | 手调或 CSS | 编译器网格 / 安全框 | 刚有 figure 网格 |
| 扩展 | 再学一个库 | 注册插件 | 手册 + 本轮 widget 注册表 |

未齐三柱质量之前，**不要**说超过 Claude Science，也不要说 Nature 级。

---

## 5. 下一刀（只服务三柱，不铺路由）

1. 把 Atlas (d)(e)(f) 迁到 `chart.heatmap` + `layout.figure`，消灭魔法数
2. `layout.board` 插件：安全区 + 具名槽，仍无新关键字
3. PDF 字体 / CJK；`unit: mm` + 单栏宽度
4. 图交互从 `__tip` 升到数据域 tooltip / brush
5. session 热路径带 visual；slim prompt 作 MCP/HTTP 默认

发现插件：`viva widgets` 或 `listWidgets()`。
