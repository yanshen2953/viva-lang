# 目标差距（诚实版）

北极星：在 IDE / 对话**内联**上，超过常见编码代理的静态图/HTML——出版级科学图 × 可交互活世界 × 自动 QA × 多 Agent 接入。

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

1. PDF 仍 Helvetica + CJK 变 `?`；无 mm/栏宽投稿尺寸
2. 无 log / 时间 / 分类轴；无 box/violin；无显著性括号
3. 图例仍在图内；多面板仍手写魔法数（Atlas (d)(e)(f) 未改用 heatmap widget）
4. 悬停是 `__tip` 字符串，不是数据域 tooltip / brush / 跨面板高亮
5. session 仍只跑 structural；visual/vision 不在热路径
6. LLM 默认 full prompt 仍带玩具模板；生成成功率未测

## 下一刀（质量，不再铺接口）

1. PDF 字体嵌入或 CJK 回退策略；scene `unit: mm` + 单栏 89 mm
2. 把 Atlas 热图面板迁到 `chart.heatmap`，消灭一截魔法数
3. session.compile 默认带 visual 检查，embed 回传 diagnostics
4. slim prompt 作为 MCP/HTTP 默认；确定性 repair 种子进 `npm test`
