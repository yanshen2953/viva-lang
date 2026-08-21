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
   `timeline`、未来 `chart.*` 都是编译期展开到 node/event，不增加关键词爆炸。

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
- 状态：❌ 未实现（明确债务）

---

## 6. Widget 与图表

| Widget | 角色 | 状态 |
| --- | --- | --- |
| `timeline` | 时间 scrub 宏 | ✅ |
| `chart.line` / `bar` / `scatter` / `heat` | 展开 frame+axis+marks | 规划 |
| `figure` 多面板 | 边距、对齐、(a)(b) 标签 | 规划（结构在 widget，外观在 handbook） |

规则：**结构展开 = widget；审美纪律 = handbook。**

---

## 7. 风格插件（Handbooks）

### 7.1 机制

```
core system prompt     # 永远加载，短
+ handbook id...       # 本轮可选，通常 0 或 1
+ user message
→ Viva source only
```

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
| playground examples | ✅ | `examples/*` `atelier` `arena` |
| frame / scale / unit | ❌ | 规划 |
| chart.* widgets | ❌ | 规划 |
| PDF/mm 导出 | ❌ | 规划 |
| handbook 运行时装载 API | ⚠️ 文档约定已有，宿主集成待做 |

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

| 阶段 | 交付 | 完成定义 |
| --- | --- | --- |
| **A 已完成** | World 交互 + Paint 基础 + layer + handbooks 约定 | Arena/Atelier 可跑；手册目录存在 |
| **B 下一步** | Space：`frame` + linear scale + 文档/一例 | 数据坐标点图无需手写 `* 2.4` |
| **C** | `chart.scatter/line/bar` widgets + `print-nature` 实手册 | 可生成可打印的多系列图 |
| **D** | unit 导出（SVG/PDF pt/mm）+ figure 面板 | 接近投稿图流程 |
| **E** | 宿主 handbook 注册表与按次注入 API | 多轮产品化 |

砍优先级：先 B 再 C；没有 B 做 C 仍是魔法数。

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

---

## 13. 文档地图

| 文档 | 角色 |
| --- | --- |
| `docs/DESIGN.md`（本文） | 完整设计真源 |
| `docs/ARCHITECTURE.md` | 流水线与实现要点 |
| `docs/LANGUAGE.md` | 语法速查 |
| `docs/handbooks/` | 风格插件 |
| `src/llm/system-prompt.ts` | Core prompt |
| `examples/` | 可执行规范 |

本文若与代码冲突：**先修代码或显式改本文并标状态**，禁止沉默漂移。
