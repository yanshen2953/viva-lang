# 目标差距（诚实版）

北极星：一门极简内联汇报语言，同时覆盖游戏交互 × 论文图表 × 影像排版；复杂度进编译器；动态插件。对照 `docs/VISION.md`。

前序清单把 PLAN §1 的 1–3 标成「齐」，**过满**。接口在，产品观感仍粗。本文以用户可见质量为准。

评估：2026-08-23。分支 `cursor/style-handbook-hook-a8c1`。

## 总判断

| 轴 | 之前说法 | 实际 |
| --- | --- | --- |
| 1 内联活世界 | 齐 | **接口齐 / 产品未齐**：Runtime 能拖点 tick；图表默认有数据域 brush/高亮；内联卡几乎没有错误/检查/修复壳 |
| 2 度量科学图 | 齐 | **骨架齐 / 出版未齐**：linear/log/band + chart.*（含 vector/funnel）能出图；图例外置刚补；时间/统计图种仍缺 |
| 3 通用 Agent 接口 | 齐 | **接入齐 / 闭环未齐**：CLI/MCP/HTTP 能编能导；LLM 生成可靠性和自动 repair 未进 CI |
| 4 流水线 | 部分 | 仍部分：Port + webhook 在，缺拖参回流演示 |
| 5 领域视图 | 部分 | 仍部分：槽位在，重领域插件刻意不做 |
| 6 可追溯 | 部分 | 仍部分：bundle 能导出，宿主未填 promptDigest |

未齐出版语义 + 图交互 + 导出保真之前，**不要**说「已经是 Nature 级」或「全面超过 Claude Science」。

## 粗糙的根因（不是缺再一个 HTTP 路由）

1. **图核语义仍缺出版层** — 有轴标题/单位/band/log/time/box/violin/括号；`print-nature` 已接管字号/字距；编译器按字号和 mm 比例堆叠刻度/标题。仍不是真正的碰撞求解。
2. **默认交互还不是完整 linked view** — `__sel.keys` 已跨面板藏行（含 box / violin / 折线）；本地 brush 仍是 marquee，无过渡。
3. **导出 ≠ 预览** — SVG 已接近 Runtime；PDF 随包 CJK 子集（examples + 论文用字），缺字仍可能 `?` / Helvetica。
4. **Agent 闭环没产品化** — session compile 附带 visual diagnostics，但不挡成功；生成成功率未测。
5. **手册仍不执行图语法** — 现在会覆盖 widget 字号，但不做避让、对齐或栏宽文法。

## 本轮已补（相对「接口堆砌」）

| 项 | 行为 |
| --- | --- |
| 轴标题 / 单位 | `xLabel` `yLabel` `xUnit` `yUnit` → `Time (week)` |
| 误差棒 | `errorField` / `yerr` → stem + caps |
| `chart.heatmap` | 数据格 + 右侧色条刻度 |
| `chart.vector` / `chart.funnel` | 数据域位移箭头；横向漏斗（`orient: h` 也对 bar 生效） |
| band / 分类轴 | 字符串列自动 band；`xScale: band` + `xCats`/`yCats`；log 刻度为 10ⁿ |
| 图例外置 | 默认 `legend: right`；`bottom` / `inside` / `false` |
| 默认悬停 / 刷选 | `__tip` + `__hover` + `__brush.{dx*}` + `__highlightGrp`；点图例也写高亮 |
| 折线按 x 排序 | 源数据乱序也能连对 |
| SVG 导出 | `font-family` / `font-weight` / `letter-spacing` / `stroke-dasharray` / 旋转轴标题 |
| 动态 widget 插件 | `registerWidget()` / `listWidgets()` |
| `layout.figure` | `cols/rows/gutter/margin/inset*` → frame + `(a)` 标签 |
| `layout.board` | `safe`/`title`/`body`/`lower`；`splits` / `beats` / `bleed` / `typeGrid` |
| 图表对位 | `panel: a` 吃已有 frame |
| 投稿尺寸 | `unit: mm` + `column: single\|double` |
| Agent 热路径 | slim prompt 默认；session compile 附 visual diagnostics |

## 仍然很粗（按用户可见排序）

1. PDF 随包 `assets/fonts/VivaSansFallback.ttf`（Droid 子集，examples + 论文用字）；缺字仍可能 `?`
2. 有 time / box / violin（KDE 轮廓）/ 显著性括号；轴刻度在场景坐标。`print-nature` 刻度 8 / 轴标题 9。观感仍粗，不是投稿成品
3. Atlas (a–f) 已走 `layout.figure` + chart 插件；(e)(f) 不再手摆像素
4. `__sel` 默认跨面板藏行；本地 brush 仍是单图 marquee，没有过渡动画
5. session visual diagnostics 不挡编译成功
6. MCP/HTTP/CLI prompt 默认 slim；生成成功率未测
7. 小栏宽 mm 图默认不再画常驻 `__tip` HUD，只留 brush 框；留白仍不像投稿成品
8. `typeGrid` 是基线叠加 + `type0`… 栏，不是跨页或视频时间轴

## 下一刀（质量，不再铺接口）

1. 真正的碰撞求解（标题/刻度/图例仍只是字号感知间距）
2. linked selection 已藏热图、折线、box/violin；仍缺过渡动画
3. 再扩 CJK 或允许宿主挂全库；`scripts/subset-cjk-font.py` 可从 Droid 重建
4. `layout.board play` / `typeGrid` 只是遮罩和基线，不是导出视频
5. agent-exam 种子编译进 CI；生成成功率仍未测（要 LLM）

对照真源：`docs/VISION.md`。
