# PLAN §1 胜利条件缺口清单

对照 `docs/PLAN.md` §1。未齐 1–6 时，**禁止**对外说「全面超过 Claude Science」；可说「交互世界轴已超过常见编码代理内联」。

评估日期：2026-08-23。真源分支：`cursor/style-handbook-hook-a8c1`（PR #9）。

| # | 条件 | 状态 | 对外可说？ | 证据 / 缺口 |
| --- | --- | --- | --- | --- |
| 1 | 内联活世界 | **齐** | 是 | Playground + `createVivaInlineEmbed()` + Session `compile/patch`；拖/点/tick 在 Runtime |
| 2 | 度量科学图 | **齐** | 是 | `frame` + linear `scale` + `chart.*` + `print-nature` handbook；`examples/figure-atlas.viva` |
| 3 | 通用 Agent 接口 | **齐** | 是 | CLI / MCP / HTTP / Node SDK / embed；同一编译核 |
| 4 | 流水线接口 | **部分** | 接口可说，端到端演示未齐 | Port + `inline.set` + `local-command` + **http-webhook**；HTTP `POST /api/pipeline/run`、MCP `viva_pipeline`。欠：语言侧 `event … pipeline:`、拖参自动回流演示、真实 Python/R 脚本样例 |
| 5 | 领域视图接口 | **部分** | 槽位可说，重领域未齐 | Registry + `builtin.viva-inline` / `image` / `iframe` / **`json-table`**。欠：mol/genome 外置插件（刻意不进核）、选中桥 UI 演示 |
| 6 | 可追溯分析 | **部分** | 答辩包可说，宿主接 LLM 未齐 | Memory Writer + `exportBundle` + CLI `viva provenance` + HTTP `/bundle` + MCP `viva_session action=bundle`。欠：交互降采样写 provenance、promptDigest 由宿主填、第三方复盘手册 |

## 本轮已补（相对 HANDOFF 接续前）

- GitHub Actions CI（`npm ci` / `build:lib` / `npm test` / Atlas `--visual`）
- HTTP + MCP 暴露 Session / Pipeline / Provenance（胜利条件 4–6 的**对外接入面**）
- `createHttpWebhookPipeline`（PLAN §4.1 首发适配器之二）
- `builtin.json-table`（PLAN §5.2 F 可选）
- `viva provenance` CLI

## 仍不可宣称

「彻底超过 Claude Science」——缺联合验收 PLAN §9.1 第 3–5 步的可演示脚本（拖参 → pipeline 重跑 → 领域选中桥 → 把 bundle 交给第三方）。

## 建议下一刀

1. `examples/pipeline-lab.viva` + `scripts/pipeline-echo.py`：拖滑块 → `pipeline.run` → 图变 + provenance 两条记录
2. Playground 双栏打开 `builtin.json-table` / `builtin.image`，点击行写 `state.selectedId`
3. CI 保持绿；不要自动 merge PR #9
