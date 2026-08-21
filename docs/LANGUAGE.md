# Viva 语言速查

Viva 只描述世界：对象、状态、关系和变化。布局、事件绑定、动画和渲染由编译器与运行时完成。

## 最小闭环

```
artifact data state entity scene layer node
resource rule event function animate timeline
tick bind if for
```

## 语法

```viva
artifact "Name"

state year = 2026
data items = [{ name: "A", x: 80, y: 120 }]

scene
  size: 880 480
  background: #0b1220
  layer main
    for item in items
      node item as items
        x: item.x
        y: item.y
        r: 16
        fill: #38bdf8

event click on items
  selected = item

rule when selected != none
  detail.visible = true

bind title <- selected.name

tick 30
  year = year + 1

animate fade
  target: title
  from: 0
  to: 1
  duration: 800ms
```

## 节点如何变成图形

运行时按属性推断 SVG 原语：

| 属性 | 图形 |
| --- | --- |
| `r` / `size` | circle |
| `w` `h` / `width` `height` | rect |
| `text` / `label` / `font` | text |
| `x1` `y1` `x2` `y2` | line |
| `d` / `path` | path |

## 表达式

`+ - * / % == != < > <= >= and or not`

字符串用双引号，颜色用 `#RRGGBB`，空值是 `none`，时间可用 `800ms` 或 `2s`。
