# Viva 完整设计（Canonical）

> 状态：与仓库实现对齐的设计真源。  
> 速查语法见 `LANGUAGE.md`；流水线见 `ARCHITECTURE.md`；风格插件见 `handbooks/`。  
> 早期长文 `LLM_Native_Interactive_Artifact_Language_Design.md` 保留为历史动机，**以本文为准**。

---

## 0. 一句话

Viva 是面向 LLM 的**小表面交互视觉语言**：模型只写「世界意图」，确定性编译器与运行时负责空间度量、交互、图层合成与渲染；**风格与期刊规范是可插拔手册，按次注入，不进语言核。**

---

## 1. 问题与非目标

### 1.1 要解决什么

| 路径 | 痛点 | Viva 回应 |
| --- | --- | --- |
| HTML/React | Token 贵、细节多、生成不稳 | 极小 DSL，禁止模型写 DOM/CSS/JS |
| Vega 类 | 强于数据映射，弱于状态/时间/交互 | World 层：state / event / tick / drag / collide |
| 纯游戏引擎脚本 | 对 LLM 过重、不可嵌入 prompt | 声明式世界 + 大运行时 |
| 「期刊皮肤关键字」 | 污染语言、不可组合 | Space 度量 + handbook 插件 |

### 1.2 非目标（刻意不做）

- 不是通用前端框架，不替代 React。
- 不是完整 Godot/UE（无刚体求解器、导航网格、3D、音频总线）。
- 不是把 Nature/Science 模板写进语法。
- 不在 core system prompt 里堆风格教条。

---

## 2. 核心原则（必须遵守）

1. **小语言，大运行时**  
   语言只描述：世界是什么、状态如何变、对象如何交互。复杂度进 Compiler / IR / Runtime / Widget。

2. **三层正交**  

   | 层 | 含义 | 语言表面 |
   | --- | --- | --- |
   | **World** | 状态、事件、时间、碰撞、拖拽 | 厚（已有核） |
   | **Space** | frame / scale / unit：数据空间 ↔ 场景空间 | 极薄挂钩（规划） |
   | **Paint** | 图层、几何外观、滤镜、导出 | 属性级（已有基础）；**风格审美 → 插件** |

3. **Widget 是宏，不是语法**  
   `timeline`、`chart.*`、`layout.figure` 都是编译期展开到 node/frame/event。新能力用 `registerWidget()`，不增加关键词。

4. **手册按次注入**  
   `core prompt + optional handbook(s) + user turn`。手册不发明语法，只约束默认审美与构图纪律。

5. **可拖拽/可仿真对象的位姿必须落在 data/state**  
   渲染属性可以是字面量；持久空间状态必须可写回。

---

## 3. 端到端流水线

```
┌─────────────────────────────────────────────────────────────┐
│  LLM call                                                    │
│  · core system prompt (短、稳定)                              │
│  · + 0..N style handbooks (单次、可选)                        │
│  · + user / tool context                                      │
└───────────────────────────┬─────────────────────────────────┘
                            │ Viva source only
                            ▼
                     Parser (lexer)
                            ▼
                   Semantic Compiler
                    · expand widgets
                    · (future) bind frames/scales
                            ▼
                      Visual IR
                            ▼
                        Runtime
                    World + Space + Paint
                            ▼
                    SVG (screen) / future PDF
```

**可靠性约束：** Parser/Compiler/Runtime 必须确定性；同一源码同一输入 → 同一 IR 与可复现渲染（随机性若需要，必须显式 seed，当前未提供）。

---

## 4. 语言核（最小闭环）

### 4.1 声明与控制

```
artifact data state entity scene layer node
resource rule event function animate timeline
tick bind if for
```

辅助：`when as in on`；字面量：`true false none`；算子：`+ - * / % == != < > <= >= and or not`。

### 4.2 事件类型（同一 `event` 关键字）

| 类型 | 含义 | 实现状态 |
| --- | --- | --- |
| `click` | 指针按下选择 | ✅ |
| `hover` | 指针移动经过 | ✅ |
| `dragstart` / `drag` / `dragend` | 指针捕获拖拽 | ✅ |
| `collide` | 固体接触进入 | ✅ |
| `key` | 键盘（目标 `scene`/`world`） | ✅ |

`__event` 载荷：`x y px py t dx dy key code other otherGroup`（场景坐标经 CTM 反变换）。

### 4.3 图层

- 声明顺序 = 绘制顺序（z-order）。
- 每层 → SVG `<g>`。
- 层属性：`opacity` `visible` `blend`，以及整层 `blur`/`glow`。
- 状态：✅

### 4.4 节点外观属性（Paint，属性不是新关键字）

填充 / 描边 / 渐变 / glow·shadow·blur / rotate·scale / 字重字距多行 / `drag` `solid`。  
详表见 `LANGUAGE.md`。状态：✅ 基础集。

### 4.5 形状推断

`r`→circle，`w/h`→rect，`text|font`→text，`x1/x2`→line，`d`→path。

---

## 5. Space 层（科学可视化的真正底座）

### 5.1 为什么必须

没有 Space，科学图只能靠 `v * 2.4` 魔法数：不可辩护、不可导出到 mm/pt、不可共享比例尺。  
**期刊皮肤冗余；度量空间必须。**

### 5.2 概念

| 概念 | 定义 |
| --- | --- |
| **Scene space** | 当前 viewBox 用户单位（已有） |
| **Frame** | 场景内一块有原点、范围、边距的绘图区 |
| **Scale** | 数据域 → frame 局部坐标的映射（linear / 未来 discrete） |
| **Unit** | 导出与规范尺寸：`px` / `pt` / `mm` / `in` 换算 |

### 5.3 语言挂钩（规划，保持极薄）

倾向 B（更干净）：节点声明所属 frame，数据字段仍写物理量，由编译器/运行时换算。

```viva
frame plot
  x: 72 520
  y: 64 400
  xlim: 0 10
  ylim: 0 100
  xUnit: "s"
  yUnit: "kPa"

layer marks
  for d in series
    node p as points
      frame: plot
      x: d.t
      y: d.p
      r: 2.5
```

**不**增加 `scatterplot` / `natureFigure` 关键字。

### 5.4 实现落点（规划）

- IR：FrameIR + ScaleIR  
- Compiler：解析 frame；widget `chart.*` 展开为 axes + marks + legend  
- Runtime：scale 求值；命中测试可在场景空间；导出时 unit 变换  
- 状态：✅ 线性 frame/scale + `chart.scatter|line|bar` MVP（见 `examples/scatter.viva`、`charts.viva`）

---

## 6. Widget 与图表

| Widget | 角色 | 状态 |
| --- | --- | --- |
| `timeline` | 时间 scrub 宏 | ✅ |
| `chart.line` / `bar` / `scatter` | 展开 frame+axis+marks | ✅ MVP |
| `chart.heat` / `chart.heatmap` | 热力 + 色条 | ✅ MVP |
| `chart.vector` / `chart.funnel` / `chart.box` / `chart.violin` | 箭头 / 漏斗 / 箱线 / 密度 | ✅ 插件 |
| `layout.figure` 多面板 | 网格 + `(a)(b)` + 题注/甲板；不写 `inset*` 时按 chrome 估留白；可铺满场景或 `panel: body` | ✅ 插件（不是关键字） |
| `layout.board` | 安全框 / 字幕条 / splits / beats / bleed / typeGrid；`--beats` PNG 序列，可选 ffmpeg 幻灯 | ✅ 插件 |

规则：**结构展开 = widget；审美纪律 = handbook。**

---

## 7. 风格插件（Handbooks）

### 7.1 机制

```
core system prompt     # 永远加载，短
+ handbook id...       # 本轮可选，通常 0 或 1
+ user message
→ Viva source only
        ↓
compile({ handbookIds })   # 同一 id 加载 preset hook（见 handbooks/HOOK.md）
```

**双层插件：** prose 手册约束 LLM 写什么；`src/style/presets/<id>.ts` 在编译期对**任意** node 场景注入 role 默认、palette()、出版策略。不依赖预置图表目录。

### 7.2 契约（靠谱性）

1. 手册**禁止**引入新语法或新事件类型。  
2. 手册只约束：色板、线宽、字号、是否允许 glow/blur、图例与面板习惯、建议导出尺寸。  
3. 多轮对话中，手册默认**不自动继承**；每轮由调用方显式选择（可缓存策略由产品层决定，语言层不假定）。  
4. Core prompt **保持风格中立**；glow/大字/细线等偏好只写在对应 handbook。

### 7.3 目录

`docs/handbooks/<id>.md`，索引见该目录 `README.md`。

| id | 用途 |
| --- | --- |
| `print-nature` | 克制印刷图：无 glow、细线、色盲友好 |
| `dashboard` | 产品仪表盘：允许 glow、更大热区 |
| `slides` | 幻灯：少层、大字、高对比 |

---

## 8. 与实现的对照表（防漂移）

| 能力 | 状态 | 主要位置 |
| --- | --- | --- |
| Parse / compile / vitest examples | ✅ | `parser` `compiler` `tests` |
| click / hover / drag* / collide / key | ✅ | `runtime.ts` |
| CTM 场景坐标 | ✅ | `runtime.ts` |
| layer 分组与 blend/opacity | ✅ | `runtime.ts` |
| gradient / glow / shadow / type | ✅ | `paint.ts` |
| timeline widget | ✅ | `widgets.ts` |
| playground examples | ✅ | `examples/*` `atelier` `arena` `param-lab` |
| frame / scale (linear) | ✅ | `space.ts` |
| chart.* widgets | ✅ | `widgets.ts` + `plugins/registry.ts` |
| widget 动态注册 | ✅ | `registerWidget()`；未知名编译失败 |
| layout.figure | ✅ | 网格 frame + `(a)(b)` + 题注；图表 `panel:`；可铺满场景或 board 槽 |
| layout.board | ✅ | safe/title/body/lower + 题注属性；`--beats` 是 PNG 序列，gif/mp4 是 ffmpeg 幻灯不是成片 |
| safe math + array concat | ✅ | `eval.ts` |
| headless simulate | ✅ | `simulate.ts` / `session.simulate` |
| export package (source+svg+prov) | ✅ | `session.exportPackage` |
| PDF/JPG/PNG 导出 | ✅ | `src/export` + `viva export` |
| PDF/mm 单位规范排版 | ❌ | 规划 |
| `handbook 运行时装载 API` | ✅ | `PromptService` + `docs/handbooks` |
| **handbook 编译期 preset hook** | ✅ | `src/style/` + `compile({ handbookIds })` |
| Host Session / provenance MVP | ✅ | `src/agent/` |

---

## 8.5 竞品推演：相对内联透视 / 汇报，何时才算「强得多」

对标对象不是「另一个画图库」，而是编码代理里的**内联透视与汇报面**：

| 表面 | 典型产出 | 强项 | 弱项 |
| --- | --- | --- | --- |
| Cursor 内联面板 | Markdown、代码块、偶发预览/图 | 工程上下文近、改代码快 | 交互世界弱；多为静态或外挂 HTML |
| Codex / Claude Code | 终端 + 文件 + 跑脚本出图 | 任意库（matplotlib/plotly） | 生成的是**代码**，不是稳定的世界模型；多轮易漂 |
| Claude Artifacts 类 | React/HTML 小应用 | 表现力上限高 | Token 重、细节碎、难在 prompt 里稳态复现 |
| Claude Science | 分析沙箱 + 领域产物（蛋白/基因组等）+ 可追溯 | **科研执行与 provenance** 极强 | 重工作台；内联「活世界」叙事不是其主战场 |

### 8.5.1 我们绝不该赢的战场（认栽，避免假目标）

- 生命科学领域专用渲染（3D 蛋白、genome track）→ Claude Science  
- 任意统计包一次性出图 → Python/R 生态  
- 完整可重复分析流水线 + HPC → Science workbench  

Viva **补位**的是：在对话/IDE **内联**里，用**极小可编译语言**生成**可交互、可演化、可多轮改意图**的视觉世界与报告件。

### 8.5.2 我们必须赢的战场（做完后应明显更强）

相对 Cursor / Codex / Claude Code 的内联汇报，以及相对「生成一段 React/matplotlib」的路径：

| 能力轴 | 代理内联现状 | Viva 做完后（A–D） |
| --- | --- | --- |
| **生成稳定性** | 模型写 HTML/JS/Plot 代码，易碎 | 小 DSL + 确定性编译；失败有 diagnostics |
| **Token / Prompt 适配** | 长代码 | 短意图；手册按次注入 |
| **交互深度** | 多为静态图或浅交互 | World：拖拽/碰撞/键盘/tick 同一套 |
| **时间与状态** | 难描述演化世界 | `tick` + `state` + `rule` 一等公民 |
| **图数同体** | 图是附件，交互是另一坨 | 同一 artifact：孪生 + 图表 + HUD |
| **多轮改法** | 「改代码」 | 「改世界意图」；IR/runtime 承接 |
| **科学可读** | 靠脚本库 | Space + chart widget + print handbook |
| **风格切换** | 重写代码 | 换 handbook，不换语法 |

**一句话差异：**  
别人内联的是「代码跑出来的图」；我们内联的是「可编译的活世界」。表现力强在 **交互×状态×时间×度量** 的乘积，不是单帧像素精度。

### 8.5.3 要使「强得多」成立，交付物必须齐（否则宣称无效）

仅有现在的 Arena/Atelier **不够**赢过 Claude Science，也只是部分赢过 Cursor 面板。下面是**硬门槛**：

| # | 门槛 | 为何必须 |
| --- | --- | --- |
| H1 | **Space：frame + scale** | 否则科学透视仍是魔法数，输给 matplotlib |
| H2 | **chart.* widgets**（scatter/line/bar 起步） | 否则「汇报」结构靠手拼，输给现成绘图库 |
| H3 | **宿主内联运行时**（IDE/对话侧可挂载 `Runtime`） | 否则再强也只是仓库玩具，进不了 Cursor 级面板体验 |
| H4 | **多轮补丁契约**（改一段 Viva / 重编译热替换，保留 state 策略明确） | 否则改图体验不如「改 Python 重跑」直观 |
| H5 | **handbook 按次注入 API** | 否则无法在汇报风 / 期刊风 / 仪表盘风间单次切换 |
| H6 | **导出或快照**（SVG 必达；PDF/mm 理想） | 否则「汇报」留不下可带走件 |

**一等接口（拉开数量级；契约见 `PLAN.md`）：**  
流水线 `PipelinePort`、领域视图 `DomainView` 槽位、可追溯 `ProvenanceWriter`，以及宿主无关的 `VivaAgentHost`。这些不是「可选小增强」，而是对外宣称超过常见代理内联前的 **§胜利条件 4–6**。

### 8.5.4 对 Claude Science 的正确关系

- **不替代**其分析工作台与领域产物。  
- **可嵌入**其「结果讲解 / 交互答辩 / 机制示意」层：Science 产出数据与静态图，Viva 产出可操作的机制世界与读者向交互报告。  
- 若强行比「谁更能出投稿主图」：在 H1+H2+导出完成前 **不许对外宣称更强**；完成后也是「交互报告件 + 可打印图」双轨，而非取代 BioNeMo/结构生物学视图。

### 8.5.5 成功验收（可演示脚本）

做完 H1–H5 后，应用同一宿主面板连续演示：

1. **一句话**生成含 frame 的散点+回归线报告（print-nature handbook）。  
2. **不改语法**，只换 dashboard handbook，重生成/补丁为可点击系列的仪表盘。  
3. 在同一 artifact 内：**拖拽参数点 → tick 仿真 → 旁路图表即时变**。  
4. 多轮只改意图（「加误差棒」「暂停演化」），源码 diff 短、编译必过。  

若 3 做不到，则相对 Claude Code「写 plotly 仪表盘」**没有**质变优势。

---

## 9. LLM 集成契约

### 9.1 Core prompt 职责

- 原语列表、事件、图层、坐标与 `__event`、最小模板。  
- **不**绑定某一审美。  
- 源：`src/llm/system-prompt.ts`（应与本文一致，随核变更）。

### 9.2 宿主侧伪代码

```ts
const messages = [
  { role: "system", content: CORE_PROMPT },
  ...(handbookIds.map(id => ({
    role: "system",
    content: loadHandbook(id), // docs/handbooks/${id}.md
  }))),
  { role: "user", content: userGoal },
];
// expect: raw .viva only
```

### 9.3 校验门

生成后必须：`compileSource` 成功 →（可选）runtime smoke / 视觉回归。失败则带 diagnostics 重试，而不是把手册写进语言。

---

## 10. 演进路线（有序，可砍）

详细接口与验收以 **`docs/PLAN.md`** 为准。摘要：

| 阶段 | 交付 | 完成定义 |
| --- | --- | --- |
| **A 已完成** | World 交互 + Paint 基础 + layer + handbooks 约定 | Arena/Atelier 可跑；手册目录存在 |
| **B 已完成** | Space：`frame` + linear scale + 文档/一例 | `examples/scatter.viva`（门槛 H1） |
| **C 已完成** | `chart.scatter/line/bar` widgets | `examples/charts.viva`（H2） |
| **D0–D2 已完成** | `src/agent/` Host / Session / Handbook / Provenance | playground dogfood；单测覆盖 |
| **E–F 已完成** | Pipeline Port + Domain View 槽位（image/iframe） | inline + local-command 适配器 |
| **G 部分** | `exportSvg` + provenance `exportBundle` | PDF/mm 仍规划 |
| **H 已完成** | `docs/hosts/minimal-host.md` | 外部按文档接入 |

砍优先级：B → C → D0；**E/F 不得先于 D0**（禁止两套挂载路径）。没有 B/C 的「内联」赢不了脚本出图；没有 D0 则赢面只存在于本仓库 playground。

---

## 11. 决策检查清单（以后加需求时用）

1. 是否可用现有 `node` 属性表达？能 → 不加关键字。  
2. 是否是数据→空间映射？是 → Space（frame/scale），不是新 chart 语法。  
3. 是否是审美/期刊规范？是 → handbook 插件。  
4. 是否是重复结构展开？是 → widget 宏。  
5. 是否让 core prompt 变长且风格化？是 → 拒绝，挪手册。  
6. 是否破坏「输出仅 Viva 源码」？是 → 拒绝。

---

## 12. 设计断言（可证伪）

1. 任意合法示例可在无 handbook 下编译运行（风格可变差，语义不变）。  
2. 注入 `print-nature` 不改变语法，只改变生成选择偏好。  
3. 未实现 Space 前，**不宣称**具备 Science/Nature 论文图完备性。  
4. 语言关键字表不因「再来一个图类型」而增长；图类型只增 widget/handbook。  
5. 未达到 §8.5.3 门槛 H1–H5 前，**不宣称**相对 Cursor/Codex/Claude Code 内联面板「表现力强得多」。  
6. **永不宣称**替代 Claude Science 的领域分析工作台；只宣称在「可编译交互世界 / 内联活报告」轴上更强（且须 H1–H5 成立）。

---

## 13. 文档地图

| 文档 | 角色 |
| --- | --- |
| `docs/DESIGN.md`（本文） | 完整设计真源 |
| `docs/PLAN.md` | 超越计划：Agent Host / Pipeline / Domain / Provenance 接口与阶段验收 |
| `docs/ARCHITECTURE.md` | 流水线与实现要点 |
| `docs/LANGUAGE.md` | 语法速查 |
| `docs/handbooks/` | 风格插件 |
| `src/llm/system-prompt.ts` | Core prompt |
| `examples/` | 可执行规范 |

本文若与代码冲突：**先修代码或显式改本文并标状态**，禁止沉默漂移。
