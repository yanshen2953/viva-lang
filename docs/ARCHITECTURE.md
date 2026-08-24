# 架构（实现要点）

完整设计真源：**[`DESIGN.md`](./DESIGN.md)**。本文只记流水线与当前实现挂钩。当前质量缺口、证据和到站退出条件见 **[`ARRIVAL_AUDIT.md`](./ARRIVAL_AUDIT.md)**。

```
LLM (+ optional handbooks) → Viva DSL → Parser → Compiler → Visual IR → Runtime → SVG
                                                              ↘ static export → SVG / vector PDF
```

## 三层

| 层 | 职责 | 状态 |
| --- | --- | --- |
| World | state / event / tick / drag / collide / key | ✅ |
| Space | frame / scale / chart widgets | ✅ `src/space.ts` |
| Paint | layer 合成 + 节点样式；风格手册插件 | ✅ 基础；手册见 `handbooks/` |

## Export & review

| 模块 | 职责 |
| --- | --- |
| `src/export/static-svg.ts` | 无浏览器 SVG；painted `data-viva-id` 与 Runtime 使用同一生成规则 |
| `src/export/vector-pdf.ts` | 真矢量 PDF（非 PNG 嵌入），但 paint 仍是 SVG 子集：缺 rotate / gradient / dash / letterSpacing / 完整 path |
| `src/review/` | 圈选工具 + 富反馈 → `agentBrief`；Session `createReview` |

Host 文档：`docs/hosts/`（含 [`review.md`](./hosts/review.md)）。

## Runtime 要点

- 拖拽：pointer capture；世界物体过 slop 才 `dragstart`，轻点在 `pointerup` 才 `click`；`drag: true` 写回 `item.x/y`；CTM 场景坐标
- 握持：Runtime `state.__hand`（`ids` / `held` / `n` / `phase`），不是关键字；Shift 加减选；空地拖过 slop 套索（橡皮筋 + 握持圈，不进 IR）；空地点清除；地图/标签等无事件装饰不抢手
- 编组：已握持的可拖单位共享一步位移，撞墙时一起停/滑，不各走各的
- 碰撞：`solid` / `event collide`；拖着的固体也参与；扫掠顶住 + 切向滑墙；作者 `collide` 只在 enter 打；`__event.phase` / `nx` / `ny`
- 键：先打 `__hand` 里的单位，再 hover，最后 `scene` / `world`
- 图层：每层 `<g>`，声明序 = z-order
- 视觉：`src/paint.ts`（gradient / glow / shadow / type / transform）

Widget（如 `timeline`）是编译期宏，不是语言关键字。`registerWidget()` 对简单展开有效；layout/chart built-in 仍依赖 `expandWidgets()` 的固定顺序和 folio/reflow/world-bind/chrome post-pass，尚不是第三方可等价替换的插件生命周期。

## LLM

`core prompt`（`src/llm/system-prompt.ts`）+ 可选 `docs/handbooks/<id>.md` 按次注入。
