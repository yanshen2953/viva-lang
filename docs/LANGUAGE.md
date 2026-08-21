# Viva 语言速查

完整设计见 [`DESIGN.md`](./DESIGN.md)。本文只做语法速查。

Viva 只描述世界：对象、状态、关系和变化。布局、事件、碰撞、拖拽、视觉样式与图层合成由编译器与运行时完成。风格审美见 `handbooks/`（按次注入，不进语言核）。

## 最小闭环

```
artifact data state entity scene layer node
resource rule event function animate timeline
tick bind if for
```

事件：`click hover dragstart drag dragend collide key`

## 图层（z-order = 声明顺序）

```viva
layer atmosphere
  opacity: 0.9
  blend: screen
  node wash
    ...

layer stage
  opacity: 1
  node panel
    ...
```

图层属性：`opacity` `visible` `blend` / `blendMode`，以及整层 `blur` / `glow`。

## 节点视觉属性

| 类别 | 属性 |
| --- | --- |
| 填充 | `fill` `color` `hoverFill` `gradient` / `fillGradient`（两色及以上） `gradientDir: x\|y` |
| 描边 | `stroke` `strokeWidth` `dash` / `strokeDash` `strokeLinecap` |
| 形体 | `r` `w`/`h` `radius` `opacity` `visible` |
| 特效 | `glow` `glowColor` `glowOpacity` `shadow`（数或 `dx dy blur`）`shadowColor` `shadowOpacity` `blur` `blend` |
| 变换 | `rotate` `scale`（数或 `sx sy`） |
| 排版 | `font`/`fontSize` `fontFamily` `fontWeight` `fontStyle` `letterSpacing` `lineHeight` `align` `baseline`；`text` 支持 `\n` 或多行数组 |
| 交互 | `drag` `solid` |

可拖拽对象的 `x`/`y` 必须挂在 `data`/`state` 对象字段上。

## 游戏级交互模板

见 `examples/arena.viva`。视觉精修见 `examples/atelier.viva`。

```viva
layer cards
  opacity: 1
  node card
    x: 560
    y: 120
    w: 260
    h: 78
    radius: 18
    gradient: #0f172a #1e293b
    shadow: 0 16 30
    glow: 0
```

## `__event` 载荷

`x y px py t dx dy key code other otherGroup`

## 节点如何变成图形

| 属性 | 图形 |
| --- | --- |
| `r` / `size` | circle |
| `w` `h` | rect |
| `text` / `label` / `font` | text |
| `x1` `y1` `x2` `y2` | line |
| `d` / `path` | path |

## 表达式

`+ - * / % == != < > <= >= and or not`
