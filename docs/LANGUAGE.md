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

节点上的 `frame:` 表示 x/y（及 x1/y1/x2/y2）是**数据域**坐标，由 frame 的 scale（`linear` / `log` / `band`）映射到场景矩形（y 轴向上）。字符串类别会映射到 band 下标。挂了 `frame:` 的 World 点（`role: mark` 或 `colorBy`）默认吃图表同一套 Runtime：`__tip` / `__hover` / `__highlightGrp`，以及跨面板 `__sel`；`x`/`y` 是数据字段时再绑 brush。作者没画图例时，编译器按 `colorBy` 补一套可点图例。`role: plot` 节点可写已有的 `title` / `controls` / `bind`（以及 `step` / `min` / `max`）；编译器在题注带画标题和芯片。`bind` 指向数值 state 且芯片是 `+`/`-` 时做增减并 clamp，不是把 `"+"` 写进 state。`interactive: false` 或已有 `event hover` 则不抢。不是新关键字。

## 图表 widgets

```viva
widget chart.scatter
  data: series
  xField: t
  yField: p
  xlim: 0 10
  ylim: 0 100
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

`layout.figure` 会创建 frame `a` `b` `c`…，画格子甲板（`decks: false` 可关）和 `(a)(b)` 标签（`labels: false` 可关）。可选 `prefix: fig` → `fig_a`。图表上写 `span: 2`（或 `colspan`）由编译器占两栏，不是新关键字。不写 `x`/`y`/`w`/`h` 时铺满场景；也可 `panel: body` 吃 `layout.board` 槽位。作者节点写 `role: panel` 或 `role: plot` 且带 `x/y/w/h` 时，编译器把它升成同名 frame（节点上的 `xlim`/`ylim` 一并带上），图表、`layout.figure` 或 World 点用已有的 `panel:` / `frame:` 对位（不是新关键字）。省略 `gutter` / `margin` / `titleH` / `captionH` 时按场景单位估（`unit: mm` 缝约 2.4 / 1.6 mm，题注条约 4.5 mm，像素图按栏宽百分比封顶），仍可手写覆盖。`title` / `subtitle` / `caption` 是属性（可绑 state），编译器画题注并给格子让出带宽；`plate: false` 可关掉外框。不写 `inset*` 时，编译器按该格绑定的 chart 估盒子（刻度/轴标题/图例/色条/`(a)`）并消一档重叠；刻度标签互叠时抽稀，仍保留两端。长图标题和轴标题按栏宽折行（最多三行；封顶后尾行加 `...`，不再把剩余词硬拼出栏宽）。右侧/底部图例的长键按剩余栏宽折行（最多两行，连字符可断）。色条和右图例先吃场景/格子剩余宽度，并在 inset 还能让时先让，仍装不下才省略。相邻格 chrome 互叠时再长一档 inset。`page: a4` 时，会被页刀切开的格子整行推到下一页，场景跟着拉高；这是页装箱，不是栏宽重排。单图不写 `areaX`/`areaY` 时，编译器按场景（含 `unit: mm` + 栏宽）估绘图区；若场景里已有作者节点或手写 frame，则停在它们腾出的最大空矩形里，不必再为旋钮/旁路点图让位。同一场景里两张及以上未绑 `panel`/`area*` 的 chart，编译器会自动切成 `layout.figure` 网格，并停在作者节点腾出的空位（题注/旋钮不会被盖住）。满幅氛围层不占空位。这是插件名，不是新关键字。宿主可用 `registerWidget()` 再挂 `chart.*` / `layout.*`；`viva widgets` 列出当前注册表。未知 widget 编译失败。

影像板（同样不是新关键字）：

```viva
widget layout.board
  title: "16:9 board"
  subtitle: "safe / title / body / lower"
  caption: "lower-third"
```

不写 `w`/`h` 时铺满场景。得到 frame `safe` `title` `body` `lower`，并画出 title/subtitle/caption。`controls: [CD8A, IL6]` + `bind: selGene` 在 lower 右侧画 HUD 芯片（选中不透明、未选 0.4，不再旁路写当前值；再出 `hud` 槽）。图表或 `layout.figure` 可 `panel: body`。`bleed: 16` 再出 `bleed` / `trim`，并默认画裁切十字（`crop: false` 可关）。

投稿尺寸：`scene` 上写 `unit: mm` 与 `column: single`（89 mm）或 `double`（183 mm）。单独用 `column`、不写 `page` 时，场景宽就是栏宽（一张投稿图）。`page: a4`（或 `letter`）时场景是纸页（A4 宽 210 mm）；`column` 变成图的栏宽，左右按双栏 183 mm 留边，未写 `x`/`w` 的 figure / 单图停在这条栏里，不再把整页收成 89 mm。场景高度超过页高时，**PDF** 按页高切片，并在每页盖 `n / N` 页码。续页顶栏会重复 `layout.figure` 题注并标 `(continued)`，或重复 `layout.board` 题注。奇数页（recto）页码和跑页眉靠右，偶数页（verso）靠左；仍不是章节标或跳页码。`layout.figure` 的格子若会骑在页缝上，编译器把整行推到下一页并拉高场景，避免从面板中间切开。SVG/PNG 仍是一张长画布。这是 scene 属性，不是新关键字，也不是会重排正文的排版器。PDF 中文默认用随包子集；宿主可用环境变量 `VIVA_PDF_CJK_FONT`、CLI `--cjk-font` 或导出选项 `cjkFontPath` 挂自己的 TTF/OTF（仍不是语言关键字）。未覆盖的字仍可能变成 `?`。

轴尺度（frame 或 chart 属性，不是新关键字）：

- `xScale: log` / `yScale: log`
- 热图第三轴：`zLabel` / `zUnit`（与 `xLabel` 同类属性，不是新关键字）；色条数字和标题按剩余栏宽折行
- `xScale: band` / `category`（字符串列会自动 band；`chart.heatmap` 的字符串 Y 同样自动 band，不必手写 `yScale`）；也可用 `xCats` / `yCats`
- 图例默认在图外右侧：`legend: right|bottom|inside|false`

`layout.board` 可选 `splits: 2` → 在 `body` 里再切 `left` / `right`；`beats: 4` → 分镜槽 `beat0`…`beat3`。不写 `safe` / `titleH` / `lowerH` 时，编译器按题注折行和 `controls` 芯片宽度估安全框与上下条（仍可手写覆盖）。`controls` + `bind` 只画芯片，选中项提高不透明度，不再旁路再写一份当前值。`bind` 若是数值 state，芯片 `+`/`-`（或 plus/minus）按 `step` 增减，可用 `min`/`max` clamp。`play: true` 用 `tick` 推进 `__beat`，非当前拍加遮罩；遮罩永不抢指针，暗着的拍也能刷选。字幕条右侧由编译器画 `n / N` 拍号（绑 `__beat`，不是新关键字）。Runtime 用 220ms CSS opacity 淡入淡出（静态导出仍硬切，不是时间轴）。`examples/paper-storyboard.viva` 是 183×103 mm 的 16:9 分镜，四拍共用同一套 `__sel`。`viva export file.viva --beats` 按 `__beat` 导出 PNG 序列；`--beats -f gif|mp4` 用 ffmpeg 把这些帧拼成幻灯（仍不是成片时间轴）。`typeGrid: true` 在安全框上画字级基线；`typeGridCols: 12` 再切 `type0`… 栏（仍不是跨页）。

`xScale: time`（或 ISO 日期字符串列自动识别）出时间刻度。`chart.box` / `chart.violin` 由编译器算四分位和密度（violin 是高斯 KDE 闭合轮廓，不是直方切片）。跨面板 `__sel` 时 box 按选中行重算四分位，不是只藏整组。`brackets: [{ a, b, label }]` 画显著性括号。轴刻度数字写在场景坐标（图框左侧 / 底侧），避免数据域 padding 把 y 标签裁进绘图区。折行的 Y 轴标题在 −90° 后从上往下读第一行。都不是新关键字。

跨面板：`__brush` 按 frame 隔离，同名 `xField` 联动；刷选写入 `__sel.keys`。有效刷选在 `dragend` 后 **保持** 选择窗（`__brush.on` 仍为 1），空点 `dragend` 才清。拖路径明显长于对角时切到数据域套索（`inside` + `pathd`），否则仍是矩形窗。其它图默认 **藏起** 不在集合里的行（含 heatmap 格子、折线线段、box / violin / 柱 / 矢量摘要）。热图格子按选中行重算均值，漏斗/柱在编译期合并重复类目并按选中行重算合计，矢量重算位移。Runtime 用 opacity + 命中组 `scale`、box/折线/柱/矢量几何和同骨架 violin 路径做约 220ms 缓动，不是时间轴。点图例色块也会写入 `__sel`（再点一次清空）。`link: dim` 可改回变淡。

图表默认交互（`interactive: false` 可关）：`__tip` 字符串、跟手 `__tipX` / `__tipY`（作者场景单位；空 `__tip` 时 tip 不画，打印件没有鬼影）、`__hover` 对象、`__brush`（场景框 + 数据域 `dx0/dy0/dx1/dy1`，刷选外的点变淡）、同 `group` 跨面板 `__highlightGrp`。点图例色块也会写 `__highlightGrp`。同一套默认也落到挂了 `frame:` 的 World 点上（投影/表达式坐标不绑 brush，以免和作者拖轨道抢手）。`__event.x` / `__event.y` 是作者场景单位（`unit: mm` 时是毫米），不是 viewBox 像素。

插件图种：`chart.scatter|line|bar|heatmap|vector|funnel`。`chart.vector` 用 `xField/yField` + `uField/vField`（数据域位移）。箭头头在场景坐标画成三角，不再是圆点；仍不是带比例尺的 quiver。`chart.funnel` 是横向 `chart.bar`（`orient: h` 也对 `chart.bar` 生效）。

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

- `xLabel` / `yLabel` + `xUnit` / `yUnit` → 轴标题（如 `Time (week)`）。未加引号的多词（`xLabel: Sum score`）会拼成一句，不必写成 `"Sum score"`
- 线性轴会键上作者 `xlim` / `ylim` 端点（`0 70` 会画出 `70`），中间仍走 nice step；挤时抽稀保留两端。`chart.bar` / `box` / `violin` 的少量整数类目轴刻在取值上（`visit` 1–6 不会因为 `xlim: 0 7` 画出 0 和 7）。折线 / 散点 / 矢量的整数 x 若铺满大部分 `xlim`（周次 0,2,…,12）也刻在取值上，不再插入 nice 的 5；稀疏散点仍键端点。漏斗的数值轴仍键端点
- `errorField` / `yerr` → 竖直误差棒
- `chart.heatmap`：`valueField` + `zlim`，右侧连续色条。色条宽高按场景比例（mm 不再把 10/40 px 当成毫米），`zLabel` 在色标数字右侧 −90° 竖排，和 `yLabel` 同一套轴标题，按绘图区高度折行。未写 `cellW`/`cellH` 时按相邻唯一 x/y 的中位步长铺格；离散数值轴刻度落在格心（`xlim: -0.5 7.5` 不再把 −0.5 / 7.5 画成刻度）；格子白缝按短边比例，不是 1 个场景单位。热图 Y 不翻转：第一行 / 最小 row 在顶上（和数据表一样），不是笛卡尔底边
- 默认 `hover` 把读数写入 `__tip`，指针写入 `__tipX` / `__tipY`（跟手 tip；`interactive: false` 可关）

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
