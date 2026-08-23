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

1. **图核语义仍缺出版层** — 有轴标题/单位/band/log/time/box/violin/括号；`print-nature` 已接管字号/字距。编译器按字号估盒子，并对标题/刻度/图例/色条/`(a)` 做一轮重叠消解。仍不是通用排版求解（不换行、不减刻度）。
2. **默认交互还不是完整 linked view** — `__sel.keys` 已跨面板藏行（含 box / violin / 折线）；Runtime 用 opacity 淡 180ms，不是时间轴动画。本地 brush 默认矩形窗，路径够长时切套索。
3. **导出 ≠ 预览** — SVG 已接近 Runtime；PNG/JPG 现在填场景底色（投稿白底不再透成黑卡）；PDF 随包 CJK 子集，缺字仍可能 `?`。
4. **Agent 闭环没产品化** — session compile 附带 visual diagnostics，但不挡成功；生成成功率未测。
5. **手册仍不执行图语法** — 会覆盖 widget 字号；深色场景上会把标题/刻度字色翻亮。仍不做避让或栏宽文法。

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
| `layout.figure` | `cols/rows/gutter/margin`；不写 `inset*` 时按绑定 chart 的 chrome 迭代估留白；不写 `x/y/w/h` 铺满场景或 `panel: body`；`title`/`subtitle`/`caption`/`plate` 由编译器画 |
| `layout.board` | `safe`/`title`/`body`/`lower`/`hud`；题注 + `controls`/`bind` 芯片；不写 `w/h` 铺满场景；`splits` / `beats` / `bleed` / `typeGrid`；`--beats` 出 PNG 序列 |
| 图表对位 | `panel: a` 吃已有 frame |
| 投稿尺寸 | `unit: mm` + `column: single\|double` |
| Agent 热路径 | slim prompt 默认；session compile 附 visual diagnostics |

## 仍然很粗（按用户可见排序）

1. PDF 随包 `assets/fonts/VivaSansFallback.ttf`（Droid 子集，examples + 论文用字）；缺字仍可能 `?`
2. 有 time / box / violin（KDE 轮廓）/ 显著性括号；轴刻度在场景坐标。`print-nature` 刻度 8 / 轴标题 9。观感仍粗，不是投稿成品
3. Atlas / figure-grid 已去掉 `inset*`、手摆 panel 卡、页面 title 和基因按钮；`layout.board` 出题注 + `controls`/`bind` HUD 芯片，`layout.figure` 吃 `body`。chrome 有盒子碰撞消解。不换行、不减刻度
4. `__sel` 默认跨面板藏行；本地 brush 松手后保持选择窗，路径够长切套索。仍无时间轴动画
5. session visual diagnostics 不挡编译成功
6. MCP/HTTP/CLI prompt 默认 slim；生成成功率未测
7. 小栏宽 mm 图默认不再画常驻 `__tip` HUD；不写 `areaX` 时编译器按场景估绘图区。仍不是投稿成品碰撞求解
8. `typeGrid` 是基线叠加 + `type0`… 栏，不是跨页或视频时间轴

## 下一刀（质量，不再铺接口）

1. 通用排版求解（换行、减刻度、跨格）；现有盒子碰撞只消一档重叠
2. linked selection 已藏热图、折线、box/violin；仍缺过渡动画
3. 再扩 CJK 或允许宿主挂全库；`scripts/subset-cjk-font.py` 可从 Droid 重建
4. `layout.board play` 遮罩现在画在图表之上（layout 先展开、chart 后展开）；`export --beats` / MCP `beats` 仍是 PNG 序列，不是成片视频
5. agent-exam 种子编译进 CI；生成成功率仍未测（要 LLM）

对照真源：`docs/VISION.md`。
