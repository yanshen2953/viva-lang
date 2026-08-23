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

节点上的 `frame:` 表示 x/y（及 x1/y1/x2/y2）是**数据域**坐标，由 frame 的 scale（`linear` / `log` / `band`）映射到场景矩形（y 轴向上）。字符串类别会映射到 band 下标。

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

`chart.line` / `chart.bar` / `chart.heatmap` / `chart.vector` / `chart.funnel` 同理。结构展开为 frame + 轴 + marks；审美仍走 handbook。

多面板不要手写 `areaX` / `areaY`。先用排版插件出格子，图表用 `panel:` 对位（`layout.*` 总会先于 `chart.*` 展开）：

```viva
widget layout.figure
  title: "Figure 2. Survival and response by cohort"
  cols: 2
  rows: 2

widget chart.scatter
  panel: a
  data: series
  xField: x
  yField: y
  xlim: 0 10
  ylim: 0 50
```

`layout.figure` 会创建 frame `a` `b` `c`…，画格子甲板（`decks: false` 可关）和 `(a)(b)` 标签（`labels: false` 可关）。可选 `prefix: fig` → `fig_a`。图表上写 `span: 2`（或 `colspan`）由编译器占两栏，不是新关键字。不写 `x`/`y`/`w`/`h` 时铺满场景；也可 `panel: body` 吃 `layout.board` 槽位。省略 `gutter` / `margin` / `titleH` / `captionH` 时按场景单位估（`unit: mm` 缝约 2.4 / 1.6 mm，题注条约 4.5 mm，像素图按栏宽百分比封顶），仍可手写覆盖。`title` / `subtitle` / `caption` 是属性（可绑 state），编译器画题注并给格子让出带宽；`plate: false` 可关掉外框。不写 `inset*` 时，编译器按该格绑定的 chart 估盒子（刻度/轴标题/图例/色条/`(a)`）并消一档重叠；刻度标签互叠时抽稀，仍保留两端。长图标题和轴标题按栏宽折行（最多三行；封顶后尾行加 `...`，不再把剩余词硬拼出栏宽）。右侧/底部图例的长键按剩余栏宽折行（最多两行，连字符可断）。色条和右图例先吃场景/格子剩余宽度，并在 inset 还能让时先让，仍装不下才省略。相邻格 chrome 互叠时再长一档 inset。仍不是跨页排版器。单图不写 `areaX`/`areaY` 时，编译器按场景（含 `unit: mm` + 栏宽）同样估绘图区。同一场景里两张及以上未绑 `panel`/`area*` 的 chart，编译器会自动切成 `layout.figure` 网格。这是插件名，不是新关键字。宿主可用 `registerWidget()` 再挂 `chart.*` / `layout.*`；`viva widgets` 列出当前注册表。未知 widget 编译失败。

影像板（同样不是新关键字）：

```viva
widget layout.board
  title: "16:9 board"
  subtitle: "safe / title / body / lower"
  caption: "lower-third"
  safe: 64
```

不写 `w`/`h` 时铺满场景。得到 frame `safe` `title` `body` `lower`，并画出 title/subtitle/caption。`controls: [CD8A, IL6]` + `bind: selGene` 在 lower 右侧画 HUD 芯片（选中不透明、未选 0.4，不再旁路写当前值；再出 `hud` 槽）。图表或 `layout.figure` 可 `panel: body`。`bleed: 16` 再出 `bleed` / `trim`，并默认画裁切十字（`crop: false` 可关）。

投稿尺寸：`scene` 上写 `unit: mm` 与 `column: single`（89 mm）或 `double`（183 mm）。

轴尺度（frame 或 chart 属性，不是新关键字）：

- `xScale: log` / `yScale: log`
- 热图第三轴：`zLabel` / `zUnit`（与 `xLabel` 同类属性，不是新关键字）；色条数字和标题按剩余栏宽折行
- `xScale: band` / `category`（字符串列会自动 band）；也可用 `xCats` / `yCats`
- 图例默认在图外右侧：`legend: right|bottom|inside|false`

`layout.board` 可选 `splits: 2` → 在 `body` 里再切 `left` / `right`；`beats: 4` → 分镜槽 `beat0`…`beat3`。不写 `safe` / `titleH` / `lowerH` 时，编译器按题注折行和 `controls` 芯片宽度估安全框与上下条（仍可手写覆盖）。`controls` + `bind` 只画芯片，选中项提高不透明度，不再旁路再写一份当前值。`play: true` 用 `tick` 推进 `__beat`，非当前拍加遮罩；Runtime 用 220ms CSS opacity 淡入淡出（静态导出仍硬切，不是时间轴）。`viva export file.viva --beats` 按 `__beat` 导出 PNG 序列；`--beats -f gif|mp4` 用 ffmpeg 把这些帧拼成幻灯（仍不是成片时间轴）。`typeGrid: true` 在安全框上画字级基线；`typeGridCols: 12` 再切 `type0`… 栏（仍不是跨页）。

`xScale: time`（或 ISO 日期字符串列自动识别）出时间刻度。`chart.box` / `chart.violin` 由编译器算四分位和密度（violin 是高斯 KDE 闭合轮廓，不是直方切片）。跨面板 `__sel` 时 box 按选中行重算四分位，不是只藏整组。`brackets: [{ a, b, label }]` 画显著性括号。轴刻度数字写在场景坐标（图框左侧 / 底侧），避免数据域 padding 把 y 标签裁进绘图区。折行的 Y 轴标题在 −90° 后从上往下读第一行。都不是新关键字。

跨面板：`__brush` 按 frame 隔离，同名 `xField` 联动；刷选写入 `__sel.keys`。有效刷选在 `dragend` 后 **保持** 选择窗（`__brush.on` 仍为 1），空点 `dragend` 才清。拖路径明显长于对角时切到数据域套索（`inside` + `pathd`），否则仍是矩形窗。其它图默认 **藏起** 不在集合里的行（含 heatmap 格子、折线线段、box / violin 摘要）。Runtime 用 opacity + 命中组 `scale` 做短缓动，不是时间轴。点图例色块也会写入 `__sel`（再点一次清空）。`link: dim` 可改回变淡。

图表默认交互（`interactive: false` 可关）：`__tip` 字符串、`__hover` 对象、`__brush`（场景框 + 数据域 `dx0/dy0/dx1/dy1`，刷选外的点变淡）、同 `group` 跨面板 `__highlightGrp`。点图例色块也会写 `__highlightGrp`。

插件图种：`chart.scatter|line|bar|heatmap|vector|funnel`。`chart.vector` 用 `xField/yField` + `uField/vField`（数据域位移）。`chart.funnel` 是横向 `chart.bar`（`orient: h` 也对 `chart.bar` 生效）。

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
- 安全数学调用（仅这些）：`sin cos tan abs sqrt floor ceil round min max clamp log exp`；`has(array, value)` 做成员判断（跨面板 `__sel.keys`）；`inside(x, y, pts)` 点在多边形内
  例：`v = param * sin(t * 0.15)`，`x = clamp(__event.x, 40, 400)`
- 不要发明 `pow` / 自定义 JS 函数
