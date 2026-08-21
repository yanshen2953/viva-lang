# 架构

```
LLM → Viva DSL → Parser → Semantic Compiler → Visual IR → Runtime → SVG
```

Visual IR 拆成五块：

- Scene IR：layer / node / 相机与尺寸
- State IR：世界状态
- Behavior IR：event / rule / bind
- Time IR：tick 与 animate
- Data IR：静态或可变数据集

Widget 不是语言核心，而是编译期宏。例如 `timeline` 会展开成轨道、填充条、标签和点击赋值。

运行时保持表达式，不在编译期把 `for` 完全拍平，这样数据变化时场景可以重新实例化。
