# 目标差距（诚实版）

北极星：一门极简内联汇报语言，同时覆盖游戏交互 × 论文图表 × 影像排版；复杂度进编译器；动态插件。对照 `docs/VISION.md`。

前序清单把 PLAN §1 的 1–3 标成「齐」，**过满**。接口在，产品观感仍粗。本文以用户可见质量为准。

评估：2026-08-23。分支 `cursor/style-handbook-hook-a8c1`。

## 总判断

| 轴 | 之前说法 | 实际 |
| --- | --- | --- |
| 1 内联活世界 | 齐 | **接口齐 / 产品未齐**：Runtime 能拖点 tick；内联卡几乎没有错误/检查/修复壳 |
| 2 度量科学图 | 齐 | **静态骨架齐 / 出版未齐**：线性 frame + chart.* 能出图；轴语义、误差、热图、导出曾明显弱于 Runtime |
| 3 通用 Agent 接口 | 齐 | **接入齐 / 闭环未齐**：CLI/MCP/HTTP 能编能导；LLM 生成可靠性和自动 repair 未进 CI |
| 4 流水线 | 部分 | 仍部分：Port + webhook 在，缺拖参回流演示 |
| 5 领域视图 | 部分 | 仍部分：槽位在，重领域插件刻意不做 |
| 6 可追溯 | 部分 | 仍部分：bundle 能导出，宿主未填 promptDigest |

未齐出版语义 + 图交互 + 导出保真之前，**不要**说「已经是 Nature 级」或「全面超过 Claude Science」。

## 粗糙的根因（不是缺再一个 HTTP 路由）

1. **图核语义不够** — 只有 tick 数字、没有轴标题/单位；误差棒/热图靠手摆节点。
2. **chart.* 默认是静图** — hover/刷选/联动要作者手写 event；相对 matplotlib 的优势没落到默认路径。
3. **导出 ≠ 预览** — SVG 曾丢掉字族、字重、虚线；PDF 仍无 CJK。投稿看的是导出件。
4. **Agent 闭环没产品化** — 语法能过、图不对；session 只跑结构启发式；agent-exam 不在 CI。
5. **手册只涂颜料** — print-nature 改色和线宽，不强制图语法。

## 本轮已补的图核（相对「接口堆砌」）

| 项 | 行为 |
| --- | --- |
| 轴标题 / 单位 | `xLabel` `yLabel` `xUnit` `yUnit` → `Time (week)` |
| 误差棒 | `errorField` / `yerr` → stem + caps |
| `chart.heatmap` | 数据格 + 右侧色条刻度 |
| 默认悬停 | hover mark/bar/linePt/heatCell → `__tip` HUD（`interactive: false` 可关） |
| 折线按 x 排序 | 源数据乱序也能连对 |
| SVG 导出 | `font-family` / `font-weight` / `letter-spacing` / `stroke-dasharray` / 旋转轴标题 |

## 仍然很粗（按用户可见排序）

1. PDF 已嵌 CJK 字体（系统 Droid/Noto）；仍无随包子集，缺字环境会回退 Helvetica
2. 有 log 轴；仍无时间 / 分类轴、box/violin、显著性括号
3. Atlas (a–d) 已迁 `layout.figure` + heatmap；(e) 向量场 / (f) 漏斗仍手摆
4. 默认有 `__hover` / `__brush` / `__highlightGrp`；刷选仍是场景坐标，不是完整数据域 filter
5. session HTTP/MCP compile 会附带 visual diagnostics（不挡编译成功）
6. MCP/HTTP/CLI prompt 默认 slim；`--full` / `variant=full` 仍可取玩具模板。生成成功率未测

## 本轮已补的语言脊柱（相对「硬编码 switch」）

| 项 | 行为 |
| --- | --- |
| 动态 widget 插件 | `registerWidget()` / `listWidgets()`；内置 `timeline` `chart.*` `layout.figure` |
| `layout.figure` | `cols/rows/gutter/margin/inset*` → frame `a` `b`… + `(a)` 标签 |
| 图表对位 | `panel: a`（或 `frame: a`）吃已有 frame，不再强制 `areaX/areaY` |
| 未知 widget | 编译失败，并列出已注册名 |
| 愿景对照 | `docs/VISION.md` — 三柱同时成立才算那门语言；现在仍是三套骨架 |

## 下一刀（质量，不再铺接口）

1. PDF 字体嵌入或 CJK 回退策略；scene `unit: mm` + 单栏 89 mm
2. Atlas 迁到 `layout.figure` + `chart.heatmap`，消灭 (d)(e)(f) 魔法数
3. `layout.board` 插件（16:9 安全框），仍无新关键字
4. session.compile 默认带 visual 检查，embed 回传 diagnostics
5. slim prompt 作为 MCP/HTTP 默认；确定性 repair 种子进 `npm test`

对照真源：`docs/VISION.md`。
