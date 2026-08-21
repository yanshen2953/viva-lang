# 架构

```
LLM → Viva DSL → Parser → Semantic Compiler → Visual IR → Runtime → SVG
```

Visual IR 拆成五块：

- Scene IR：layer / node / 尺寸
- State IR：世界状态
- Behavior IR：event / rule / bind（含 drag / collide / key）
- Time IR：tick 与 animate
- Data IR：静态或可变数据集（可拖拽实体的 x/y 必须挂在这里）

## Runtime（游戏级）

运行时负责把小语言变成 Godot/UE 风格的交互闭环：

| 能力 | 机制 |
| --- | --- |
| 拖拽 | `pointer` 捕获；`dragstart` / `drag` / `dragend`；`drag: true` 自动写回 `item.x/y` |
| 坐标 | `getScreenCTM().inverse()` 映射到 viewBox 场景坐标 |
| 碰撞 | `solid: true` 或 `event collide`；进入接触时触发；拖拽中的物体不参与接触 |
| 键盘 | `event key on scene`（`__event.key`） |
| 时间 | `tick` 仿真步进 + `animate` 呈现动画 |
| 图层 | 每个 `layer` 编译为 SVG `<g>`；声明顺序即 z-order；支持 `opacity` / `blend` / 整层滤镜 |
| 视觉 | `src/paint.ts`：渐变、glow/shadow/blur、dash、rotate/scale、字重字距多行 |

Widget 不是语言核心，而是编译期宏。例如 `timeline` 会展开成轨道、填充条、标签和点击赋值。

运行时保持表达式，不在编译期把 `for` 完全拍平，这样数据变化时场景可以重新实例化。
