# Viva 语言速查

完整设计见 [`DESIGN.md`](./DESIGN.md)。本文只做语法速查。

Viva 只描述世界：对象、状态、关系和变化。布局、事件、碰撞、拖拽、视觉样式与图层合成由编译器与运行时完成。风格审美见 `handbooks/`（按次注入，不进语言核）。

## 最小闭环

```
artifact data state entity scene layer node
resource rule event function animate timeline
tick bind if for frame widget
```

事件：`click hover dragstart drag dragend collide key`

完整最小示例（标点以本块为准；勿写成 YAML/`artifact {`）：

```viva
artifact "Demo"

state n = 0

data rows = [
  { x: 0, y: 1 }
  { x: 1, y: 2 }
]

frame plot
  x: 40 400
  y: 40 300
  xlim: 0 2
  ylim: 0 3

scene
  size: 640 360
  background: #0b1220

  layer main
    for row in rows
      node p as points
        frame: plot
        x: row.x
        y: row.y
        r: 4
        fill: #0072B2

widget chart.line
  data: rows
  xField: x
  yField: y
  xlim: 0 2
  ylim: 0 3
  areaX: 420 620
  areaY: 40 300

event click on points
  n = n + 1

tick 30
  n = n + 0

rule when n > 10
  n = 0

timeline
  from: 2000
  to: 2030
  bind: n
```

## Space（frame / scale）

```viva
frame plot
  x: 80 720
  y: 70 400
  xlim: 0 10
  ylim: 0 100

layer marks
  for d in series
    node p as points
      frame: plot
      x: d.t
      y: d.p
      r: 3
```

节点上的 `frame:` 表示 x/y（及 x1/y1/x2/y2）是**数据域**坐标，由线性 scale 映射到 frame 的场景矩形（y 轴向上）。

## 图表 widgets

```viva
widget chart.scatter
  data: series
  xField: t
  yField: p
  xlim: 0 10
  ylim: 0 100
  areaX: 80 720
  areaY: 70 400
```

`chart.line` / `chart.bar` / `chart.heatmap` 同理。结构展开为 frame + 轴 + marks；审美仍走 handbook。

多面板不要手写 `areaX` / `areaY`。先用排版插件出格子，图表用 `panel:` 对位（`layout.*` 总会先于 `chart.*` 展开）：

```viva
widget layout.figure
  x: 24
  y: 28
  w: 912
  h: 620
  cols: 2
  rows: 2
  gutter: 32

widget chart.scatter
  panel: a
  data: series
  xField: x
  yField: y
  xlim: 0 10
  ylim: 0 50
```

`layout.figure` 会创建 frame `a` `b` `c`…，并画 `(a)(b)` 标签（`labels: false` 可关）。可选 `prefix: fig` → `fig_a`。这是插件名，不是新关键字。宿主可用 `registerWidget()` 再挂 `chart.*` / `layout.*`；`viva widgets` 列出当前注册表。未知 widget 编译失败。

影像板（同样不是新关键字）：

```viva
widget layout.board
  w: 1280
  h: 720
  safe: 64
```

得到 frame `safe` `title` `body` `lower`。图表可 `panel: body`。

投稿尺寸：`scene` 上写 `unit: mm` 与 `column: single`（89 mm）或 `double`（183 mm）。轴可 `xScale: log` / `yScale: log`（frame 或 chart 属性）。

图表默认交互（`interactive: false` 可关）：`__tip` 字符串、`__hover` 对象、`__brush` 框选、同 `group` 跨面板 `__highlightGrp`。

出版级常用 props（均为 widget 属性，不是新关键字）：

```viva
widget chart.scatter
  data: series
  xField: t
  yField: p
  errorField: err
  xLabel: Time
  xUnit: week
  yLabel: Pressure
  yUnit: kPa
  xlim: 0 10
  ylim: 0 100
```

- `xLabel` / `yLabel` + `xUnit` / `yUnit` → 轴标题（如 `Time (week)`）
- `errorField` / `yerr` → 竖直误差棒
- `chart.heatmap`：`valueField` + `zlim`，右侧连续色条
- 默认 `hover` 把读数写入 `__tip`（`interactive: false` 可关）

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

- 两边都是数组时，`+` 表示拼接：`series = series + [{ t: t, v: x }]`
- 安全数学调用（仅这些）：`sin cos tan abs sqrt floor ceil round min max clamp`
  例：`v = param * sin(t * 0.15)`，`x = clamp(__event.x, 40, 400)`
- 不要发明 `pow` / 自定义 JS 函数
