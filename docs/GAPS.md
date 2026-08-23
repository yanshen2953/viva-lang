# 目标差距（诚实版）

北极星：一门极简内联汇报语言，同时覆盖游戏交互 × 论文图表 × 影像排版；复杂度进编译器；动态插件。对照 `docs/VISION.md`。

前序清单把 PLAN §1 的 1–3 标成「齐」，**过满**。接口在，产品观感仍粗。本文以用户可见质量为准。

评估：2026-08-23。分支 `cursor/style-handbook-hook-a8c1`。

## 总判断

| 轴 | 之前说法 | 实际 |
| --- | --- | --- |
| 1 内联活世界 | 齐 | **接口齐 / 产品未齐**：Runtime 能拖点 tick；图表默认有数据域 brush/高亮；内联卡有只读结构检查条，仍无 visual / 自动修复 |
| 2 度量科学图 | 齐 | **骨架齐 / 出版未齐**：linear/log/band + chart.*（含 vector/funnel）能出图；图例外置刚补；时间/统计图种仍缺 |
| 3 通用 Agent 接口 | 齐 | **接入齐 / 闭环未齐**：CLI/MCP/HTTP 能编能导；LLM 生成可靠性和自动 repair 未进 CI |
| 4 流水线 | 部分 | 仍部分：Port + webhook 在，缺拖参回流演示 |
| 5 领域视图 | 部分 | 仍部分：槽位在，重领域插件刻意不做 |
| 6 可追溯 | 部分 | 仍部分：bundle 能导出，宿主未填 promptDigest |

未齐出版语义 + 图交互 + 导出保真之前，**不要**说「已经是 Nature 级」或「全面超过 Claude Science」。

## 粗糙的根因（不是缺再一个 HTTP 路由）

1. **图核语义仍缺出版层** — 有轴标题/单位/band/log/time/box/violin/括号；`print-nature` 已接管字号/字距。编译器按字号估盒子，并对标题/刻度/图例/色条/`(a)` 做一轮重叠消解；图/轴标题按栏宽折行，封顶后尾行省略，重叠刻度抽稀，相邻格 chrome 再长一档 inset。仍不是通用排版求解。
2. **默认交互还不是完整 linked view** — `__sel.keys` 已跨面板藏行（含 box / violin / 折线）；box 四分位、violin KDE 和折线线段会按选中行重算/重连。Runtime 用 CSS opacity + highlight `scale` 缓 220ms（含 play 拍遮罩）；box/折线摘要几何也走同一段 220ms 插值（violin 路径 `d` 仍硬切）。不是时间轴动画。本地 brush 默认矩形窗，路径够长时切套索。
3. **导出 ≠ 预览** — SVG/PDF 已接近 Runtime，并硬切藏 `visible: false` 的 linked 摘要（不是 220ms 缓动）；PNG/JPG 填场景底色；`page: a4` 的 PDF 按页高切片并盖 `n / N` 页戳（续页可带 figure `(continued)`），SVG 仍是长画布；不是跑页眉排版器。PDF 随包 CJK 子集，缺字仍可能 `?`。
4. **Agent 闭环没产品化** — session compile 附带 visual diagnostics，但不挡成功；内联卡只画结构检查条，不自动修；生成成功率未测。
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
| `layout.figure` | `cols/rows/gutter/margin`；图表 `span: 2` 跨栏；不写 `inset*` / `x/y/w/h` 时按绑定 chart 估留白并铺满；相邻格再长 inset；`title`/`subtitle`/`caption`/`plate` 由编译器画。仍不是跨页 |
| `layout.board` | `safe`/`title`/`body`/`lower`/`hud`；题注 + `controls`/`bind` 芯片（选中亮、不另画绑定值）；不写 `w/h` 铺满场景；不写 `safe`/`titleH`/`lowerH` 时按题注折行和芯片估条带；`splits` / `beats` / `bleed` / `typeGrid`；`--beats` 出 PNG 序列，可选 ffmpeg 拼 GIF/MP4 幻灯 |
| 图表对位 | `panel: a` 吃已有 frame |
| 投稿尺寸 | `unit: mm` + `column: single\|double` |
| Agent 热路径 | slim prompt 默认；session compile 附 visual diagnostics |

## 仍然很粗（按用户可见排序）

1. PDF 随包 `assets/fonts/VivaSansFallback.ttf`（Droid 子集，examples + 论文用字）；缺字仍可能 `?`
2. 有 time / box / violin（KDE 轮廓）/ 显著性括号；轴刻度在场景坐标。`print-nature` 刻度 8 / 轴标题 9。观感仍粗，不是投稿成品
3. Atlas / figure-grid 已去掉 `inset*`、手摆 panel 卡、页面 title 和基因按钮；`layout.board` 出题注 + `controls`/`bind` HUD 芯片（选中芯片亮、不再另画绑定值），不写 `safe`/`titleH`/`lowerH` 时按题注折行和芯片估条带。`layout.figure` 吃 `body`，图表 `span: 2` 可跨栏。`page: a4` 只切 PDF 页并盖 `n / N` 页戳，不重排。chrome 有盒子碰撞消解；图/轴标题和图例键按栏宽折行（Y 轴折行后自上而下阅读；行数封顶后尾行 `...`），重叠刻度抽稀，相邻格互叠时再长 inset。仍不是跨页排版器
4. `__sel` 默认跨面板藏行；box 四分位、violin 密度和折线线段按选中行重算/重连。本地 brush 松手后保持选择窗，路径够长切套索。高亮、藏行、`play` 遮罩和 box/折线几何缓 220ms；violin `d` 仍硬切。仍无时间轴动画
5. session visual diagnostics 不挡编译成功
6. MCP/HTTP/CLI prompt 默认 slim；生成成功率未测
7. 小栏宽 mm 图默认不再画常驻 `__tip` HUD；不写 `areaX` 时编译器按场景估绘图区。inset 先按 38% 软顶，装不下再让到约半格，仍可能溢出，不是投稿成品碰撞求解
8. `typeGrid` 是基线叠加 + `type0`… 栏，不是跨页或视频时间轴

## 下一刀（质量，不再铺接口）

1. 更完整的排版求解；`page: a4` 只做 PDF 页高切片并盖 `n / N` 页戳，不会把图重排到下一页，也不是跑页眉。`layout.figure` 已能 `span` 跨栏，省略 gutter/margin/titleH 时按 mm/像素估缝和题注带；图/轴标题、图例键和色条标签会按栏宽折行；色条/右图例先按场景剩余宽度和 inset 让路，仍装不下才省略，重叠刻度会抽稀，相邻格 chrome 会再让一档
2. linked selection 已藏热图、折线、box/violin；box 四分位、violin KDE 和折线线段会按 `__sel` 行重算/重连。Runtime 对 box/折线几何做 220ms 插值，violin `d` 仍硬切。仍缺时间轴动画
3. 再扩 CJK 或允许宿主挂全库；`scripts/subset-cjk-font.py` 可从 Droid 重建
4. `layout.board play` 遮罩画在图表之上，Runtime 用 220ms CSS opacity 淡入淡出（不是时间轴）；`export --beats` / MCP `beats` 默认 PNG 序列，`gif|mp4` 只是 ffmpeg 幻灯，不是成片时间轴
5. agent-exam 种子编译进 CI；生成成功率仍未测（要 LLM）

对照真源：`docs/VISION.md`。
