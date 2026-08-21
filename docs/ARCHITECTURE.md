# 架构

```
LLM (+ optional handbooks) → Viva DSL → Parser → Semantic Compiler → Visual IR → Runtime → SVG
```

## 三层正交模型

Viva 不是图表 DSL，也不是皮肤引擎。长期底座拆成三层：

| 层 | 职责 | 进哪里 |
| --- | --- | --- |
| **World** | entity / state / event / tick / drag / collide | 语言核 + Runtime（已有） |
| **Space** | frame / scale / unit（数据空间 ↔ 场景空间） | 主要在 IR + Compiler/Runtime；语言只留极薄挂钩 |
| **Paint** | layer / gradient / type / export | Runtime（已有基础）；**风格与期刊审美做成插件手册** |

科学出版能力 = Space（必须的度量语义）+ Paint 插件（可选的风格手册），**不是**新的语言关键字表。

Visual IR 当前块：

- Scene IR：layer / node / 尺寸（演进：frame）
- State IR：世界状态
- Behavior IR：event / rule / bind（含 drag / collide / key）
- Time IR：tick 与 animate
- Data IR：静态或可变数据集（可拖拽实体的 x/y 必须挂在这里）

## Runtime

| 能力 | 机制 |
| --- | --- |
| 拖拽 | `pointer` 捕获；`dragstart` / `drag` / `dragend`；`drag: true` 自动写回 `item.x/y` |
| 坐标 | `getScreenCTM().inverse()` 映射到 viewBox 场景坐标 |
| 碰撞 | `solid: true` 或 `event collide`；进入接触时触发；拖拽中的物体不参与接触 |
| 键盘 | `event key on scene`（`__event.key`） |
| 时间 | `tick` 仿真步进 + `animate` 呈现动画 |
| 图层 | 每个 `layer` 编译为 SVG `<g>`；声明顺序即 z-order；支持 `opacity` / `blend` / 整层滤镜 |
| 视觉 | `src/paint.ts`：渐变、glow/shadow/blur、dash、rotate/scale、字重字距多行 |

Widget 不是语言核心，而是编译期宏（如 `timeline`；未来 `chart.*` 同理）。

## 风格插件与多轮手册注入

风格、主题、期刊规范 **不进语言核**，做成可插拔 handbook：

```
core system prompt   (永远短：原语 + 模板)
        +
optional handbook     (按需单次注入，例如 nature-print / dashboard-glow / slides)
        +
user turn
```

约定：

1. **Core prompt**（`src/llm/system-prompt.ts`）只保留正交原语与最小模板，不写死 Nature/游戏皮肤。
2. **Style plugins** 是独立手册文档（色板、线宽、字号 pt、是否允许 glow、图例惯例、导出尺寸）。多轮生成时由调用方选择 **0..N 本** 注入，且通常 **只对当次生成生效**。
3. **Chart / figure widgets** 负责结构展开（轴、刻度、误差棒）；plugin 只约束外观与排版纪律。
4. LLM 输出仍是纯 Viva 源码；plugin 不引入新语法，只改变“怎么选属性默认值与构图习惯”。

这样科学风、产品风、幻灯风可以并存，而不污染最小闭环。

运行时保持表达式，不在编译期把 `for` 完全拍平，这样数据变化时场景可以重新实例化。
