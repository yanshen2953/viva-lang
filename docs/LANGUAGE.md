# Viva 语言速查

Viva 只描述世界：对象、状态、关系和变化。布局、事件绑定、动画、碰撞和拖拽由编译器与运行时完成。

## 最小闭环（游戏级）

```
artifact data state entity scene layer node
resource rule event function animate timeline
tick bind if for
```

事件类型（同一个 `event` 关键字）：

```
click hover dragstart drag dragend collide key
```

节点交互属性：

```
drag: true      # 自动跟随指针（指针捕获）
solid: true     # 参与碰撞
hoverFill: ...  # 悬停变色
```

## 游戏级交互模板

```viva
artifact "Arena"

state paused = false
state score = 0

data units = [
  { name: "Alpha", x: 120, y: 360, hp: 100 }
]

data enemies = [
  { x: 400, y: 200, vx: -1.5, vy: 1.2, r: 16 }
]

data bases = [
  { name: "Hub", x: 80, y: 90, w: 140, h: 80, owner: "空" }
]

scene
  size: 880 520
  layer actors
    for enemy in enemies
      node enemy as enemies
        x: enemy.x
        y: enemy.y
        r: enemy.r
        fill: #f43f5e
        solid: true

    for unit in units
      node unit as units
        x: unit.x
        y: unit.y
        r: 18
        fill: #38bdf8
        drag: true
        solid: true

event drag on units
  unit.x = __event.x
  unit.y = __event.y

event dragend on units
  for base in bases
    if unit.x > base.x
      if unit.x < base.x + base.w
        if unit.y > base.y
          if unit.y < base.y + base.h
            base.owner = unit.name
            score = score + 10

event collide on units
  if __event.otherGroup == "enemies"
    unit.hp = unit.hp - 20

event key on scene
  if __event.key == " "
    paused = not paused

tick 20
  if not paused
    for enemy in enemies
      enemy.x = enemy.x + enemy.vx
      enemy.y = enemy.y + enemy.vy
```

## `__event` 载荷

| 字段 | 含义 |
| --- | --- |
| `x` `y` | 场景坐标（viewBox）；拖拽时已扣抓取偏移 |
| `px` `py` | 原始指针场景坐标 |
| `t` | 归一化横向位置 0..1 |
| `dx` `dy` | 相对 dragstart 的位移 |
| `key` `code` | 键盘事件 |
| `other` / `otherGroup` | 碰撞对方 |

## 节点如何变成图形

| 属性 | 图形 |
| --- | --- |
| `r` / `size` | circle |
| `w` `h` / `width` `height` | rect |
| `text` / `label` / `font` | text |
| `x1` `y1` `x2` `y2` | line |
| `d` / `path` | path |

可拖拽对象的位置必须来自 `data`/`state` 中的对象字段（`x`/`y`），这样拖拽才能写回世界。

## 表达式

`+ - * / % == != < > <= >= and or not`

字符串用双引号，颜色用 `#RRGGBB`，空值是 `none`，时间可用 `800ms` 或 `2s`。
