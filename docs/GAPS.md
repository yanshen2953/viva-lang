# 目标差距（诚实版）

北极星：一门极简内联汇报语言，同时覆盖游戏交互 × 论文图表 × 影像排版；复杂度进编译器；动态插件。对照 `docs/VISION.md`。

前序清单把 PLAN §1 的 1–3 标成「齐」，**过满**。接口在，产品观感仍粗。本文以用户可见质量为准。

评估：2026-08-24。分支 `cursor/style-handbook-hook-a8c1`。接续说明：`docs/HANDOFF.md`。

## 总判断

| 轴 | 之前说法 | 实际 |
| --- | --- | --- |
| 1 内联活世界 | 齐 | **接口齐 / 产品未齐**：Runtime 能拖点 tick；图表默认有数据域 brush/高亮；`__view` 覆盖 hover/drag/brush/play/pause/page；内联卡有 browser visual。仍不是 Unity 级游戏引擎 |
| 2 度量科学图 | 齐 | **骨架齐 / 出版未齐**：linear/log/band + chart.*（含 vector/funnel）能出图；手册 typography 驱动 chrome 折行；色条有脊线；figure 与正文走同一栏宽 compose。仍不是 Nature 投稿成品 |
| 3 通用 Agent 接口 | 齐 | **接入齐 / 闭环加严**：CLI/MCP/HTTP 能编能导；确定性 repair 进 session；visual 错误失败 compile success；离线 exam 种子编译率在 CI。LLM 生成率用 key 实测 |
| 4 流水线 | 部分 | 仍部分：Port + webhook + `attachDragParamLoop`（`watch("param")` → pipeline）。无自动 watch 宿主默认开 |
| 5 领域视图 | 部分 | 仍部分：槽位在，重领域插件刻意不做 |
| 6 可追溯 | 部分 | 仍部分：bundle 能导出，宿主未填 promptDigest |

未齐出版语义 + 图交互 + 导出保真之前，**不要**说「已经是 Nature 级」或「全面超过 Claude Science」。

## 粗糙的根因（不是缺再一个 HTTP 路由）

1. **图核语义仍缺出版层** — 标题/轴/图例/色条/`(a)` 用同一残差向量长 inset；`placePaperChrome` 位姿也是同一残差循环。手册 typography 驱动折行/字号。色条有左右脊线。栏宽 compose 会 snap / page-fit / hop+repack。观感仍粗，不是 Nature 投稿成品。
2. **默认交互还不是完整 linked view** — `__sel` 跨面板藏行并重算摘要。`layout.board play` 是 hold+ease 时钟，可写 `holds:` / `ins:` / `outs:` / `order:` / `cuts:` / `tracks:` 剪辑轨。`__view` 有 hover/drag/brush/play/pause/page 转移。静态导出可读 `__easeU` + `__easeFrom` 采 220ms 中点。
3. **导出 ≠ 预览** — play 导出按编辑轨采 hold / playback 帧；`__sel` 几何可按 `__easeU` 插值。正文与 figure 同一栏宽流。PDF 缺字进 `missingGlyphs`。包内 CJK 是全库。
4. **Agent 闭环** — visual 错误失败 compile success（IR 仍返回以便 repair）。内联卡 + domain 视图跑 browser visual。session 对 overflow / 空栏 / 轴做确定性 repair。`attachDragParamLoop` 是宿主胶水。离线 20 个 exam 种子编译率在 CI。
5. **手册开始执行图语法** — policies + typography 进 expand / chrome；newspaper 用栏宽度量。

## 本轮已补（相对「接口堆砌」）

| 项 | 行为 |
| --- | --- |
| 轴标题 / 单位 | `xLabel` `yLabel` `xUnit` `yUnit` → `Time (week)`；未加引号的多词（`xLabel: Sum score`）拼成一句，不再静默丢掉 |
| 误差棒 | `errorField` / `yerr` → stem + caps |
| `chart.heatmap` | 数据格 + 右侧色条刻度 |
| `chart.vector` / `chart.funnel` | 数据域位移箭头；横向漏斗（`orient: h` 也对 bar 生效） |
| band / 分类轴 | 字符串列自动 band；`xScale: band` + `xCats`/`yCats`；log 刻度为 10ⁿ |
| 图例外置 | 默认 `legend: right`；`bottom` / `inside` / `false` |
| 默认悬停 / 刷选 | `__tip` + 跟手 `__tipX`/`__tipY` + `__hover` + `__brush.{dx*}` + `__highlightGrp`；点图例也写高亮；`__event` 是作者场景单位 |
| 折线按 x 排序 | 源数据乱序也能连对 |
| SVG 导出 | `font-family` / `font-weight` / `letter-spacing` / `stroke-dasharray` / 旋转轴标题 |
| 动态 widget 插件 | `registerWidget()` / `listWidgets()` |
| `layout.figure` | `cols/rows/gutter/margin`；图表 `span: 2` 跨栏；不写 `inset*` / `x/y/w/h` 时按绑定 chart 估留白并铺满；相邻格再长 inset；`title`/`subtitle`/`caption`/`plate` 由编译器画。仍不是跨页 |
| `layout.board` | `safe`/`title`/`body`/`lower`/`hud`；题注 + `controls`/`bind` 芯片（选中亮、不另画绑定值）；不写 `w/h` 铺满场景；不写 `safe`/`titleH`/`lowerH` 时按题注折行和芯片估条带；`splits` / `beats` / `bleed` / `typeGrid`；`--beats` 出 PNG 序列，可选 ffmpeg 拼 GIF/MP4 幻灯 |
| 图表对位 | `panel: a` 吃已有 frame |
| 投稿尺寸 | `unit: mm` + `column: single\|double` |
| Agent 热路径 | slim prompt 默认；MCP/HTTP compile 与 session compile/patch 附 raster visual QA（错误失败 success，IR 仍返回） |
| 旋转感知 chrome 盒 | 审查 / Runtime / 结构检查共用 CJK 字宽 + `rotate` AABB（mm 先 scale 到 CSS px）；`check.struct.chromeOverflow` 只警告 |
| inset 封顶后回收 | `placePaperChrome` 把标题/轴题/图例往格内收，不推进刻度；互叠缝跟 `pad` 走 |
| 绘图区下限 | `clampChartInsets` 按 `MIN_PLOT_FRAC`（0.22）和 8 场景单位保绘图区，不再按侧帽卡 38%/50%；`growInsetsForChrome` / 邻居按溢出整量让路 |
| typeGrid 灌文 | 12 导轨仍画 `type0`…；`body:` 按可读 2–3 栏灌槽，paged 时与 figure 走同一栏宽 compose |
| 续页跑页眉 | 多页 `page:` 续页顶栏重复 figure `(continued)` 或 board 题注；recto 靠右、verso 靠左。仍不是章节标或跳页码 |
| play 遮罩不抢指针 | 全部拍遮罩按名字 `_veil_` 设 `pointer-events: none`（不只是当前拍 `visible: false`）；暗着的拍也能刷选。字幕条右侧画 `__beat` 的 `n / N`。`paper-storyboard` 是 183×103 mm 分镜 + play + 同一套 `__sel`。storyboard/board 图不再写 `interactive: false` |
| mm 跟手 tip | 紧凑/投稿图不再靠常驻角 HUD；`chartTip` 跟 `__event` 走，空字不画；HUD/brush/folio 不抢指针。paper-cjk / paper-column / paper-pages / paper-spread / paper-linked-pages / paper-board-linked / paper-storyboard / figure-grid / figure-span / box / violin / time-axis / brackets 默认可交互。绑了 board 槽的 figure 也会避页刀；场景拉高后 lower-third 跟到最后一页。`paper-board-linked` 是 board 安全框 + A4 页刀 + 跨页 `__sel`。`paper-storyboard` 是 16:9 mm 分镜 + play + 跨拍 `__sel` |
| 未加引号多词轴题 | `xLabel: Sum score` 不再被收成 ident 数组后静默丢掉；`paper-linked-marks` 漏斗 X 轴画出 `Sum score`。仍不是投稿成品轴语义 |
| 线性轴端点 | `niceTicks` 键上作者 `xlim`/`ylim` 两端；`0 70` 不再停在 60。挤时抽稀仍留两端。仍不是完整轴文法 |
| mm 色条尺度 | 热图色带按 `sceneScale` 画；`zLabel` 在色标右侧 −90° 竖排（第三轴），按绘图区高度折行。色条刻度落在 `zlim`（整数 0…4 逐档，更宽域 nice + 键端），并画短刻度线，不再只标底/中/顶三段。顺序色走 SVG `linearGradient`（Runtime 与静态导出同一套），不再叠分类色块。仍不是投稿色条 |
| 热图格子 | 未写 `cellW`/`cellH` 时按相邻唯一坐标的中位步长铺格（`0 2 4` 不再用宽 1 的瘦条）；离散数值轴刻度落在格心，不再把 `xlim: -0.5 7.5` 的半格端点画成刻度；白缝是短边的 5%，不再减 1 个场景单位（mm 下不再掏出 1 mm 洞）。热图 Y 第一行在顶上。热图默认不画穿过格子的笛卡尔虚线。仍不是 Nature 色矩阵 |
| 柱类目刻度 | `chart.bar` / `box` / `violin` 的少量整数类目轴刻在取值上，不再把 `xlim` 两端空位（Atlas visit `0 7`）画成刻度。折线 / 散点 / 矢量的整数 x 若铺满大部分域（周次 0…12）也刻在取样点，不再插入 nice 5；稀疏散点仍键端点。漏斗数值轴仍键端点。仍不是完整类目文法 |
| 矢量箭头 | `chart.vector` 的头在场景坐标画成三角，杆停在箭颈。仍不是带比例尺的 quiver |
| 色条刻度 | 热图色条按 `zlim` 刻度（Atlas `0 4` 不再被读成 0–6；`6 28` 不再只标 6/17/28）。色带是一条顺序色 `linearGradient`。仍不是 Nature 连续色标 |
| 投稿方角框 | `print-nature` 的 plot / figure deck / plate / 柱形圆角为 0（手册接管，不再写死 6/8/3）。`dashboard` 仍是圆角卡片和圆角柱。仍不是栏宽排版器 |
| HUD 芯片 | 按 10pt 字宽估宽（`CD8A` 不再用 8pt/44 下限）；标签走 `hud` 角色。挤时仍可收到 48。仍可能被视觉 OCR 读错 |
| 世界手 | 点/拖 slop 分离；`state.__hand` 握持；拖着的固体也参与碰撞；扫掠顶住 + 切向滑墙；编组共享一步；空地套索画橡皮筋、手里的单位画圈；装饰节点不抢空地手势；键先打手里的单位。不是刚体引擎 |

## 仍然很粗（按用户可见排序）

1. 包内默认 `VivaSansCJK.ttf` 全库；宿主路径仍可覆盖。未覆盖的字仍可能 `?`，导出会记 `missingGlyphs`
2. 手册 typography 驱动 chrome 字号/折行；色条有脊线。观感仍粗，不是投稿成品
3. 正文与 figure 同一栏宽 compose（snap / page-fit / hop+repack）。不是 Adobe InDesign
4. play 可写 `holds` / `ins` / `outs` / `order` / `cuts` / `tracks` 剪辑轨；`__view` 有 hover/drag/pause。不是桌面 NLE
5. session 会修 overflow / 空栏绑 data / 补轴题；visual 错误失败 success。LLM 生成率用 key 实测
6. `attachDragParamLoop` 要把 `watch("param")` 接到 pipeline；宿主须自己挂
7. 小栏宽 mm 图跟手 `__tip`。inset 触底后仍可能省略或收回格内
8. `typeGrid` 与 figure 共用栏宽度量，仍不是跨页报纸成品
9. 世界手能握、能顶、能多选、能看见套索，仍不是 Unity 级物理 / 输入栈

## 到站考试（四道门）

怎么知道自己到了，而不是又「接口齐」：同一份极小源码过眼睛 / 手 / 导出 / agent。地板在 `tests/exam/four-gates.test.ts`。

| 门 | 地板（CI 锁住） | 到站？ |
| --- | --- | --- |
| 眼睛 | 89 / 183 mm 的 SVG 与矢量 PDF 同宽；paper-cjk 缺字表空 | **否**。Atlas 仍是 1360 px 工作室。间距像印的没有度量。没有屏幕和 PDF 并排视觉 |
| 手 | 四件默认可刷；翻拍后 `__sel` 还在；暗拍遮罩不抢指针 | **否**。是 `simulate`，不是 Runtime 指针连打四件。跳页在 `paper-pages` |
| 导出 | `data-viva-id` 对 flatten；成片帧数跟 Clock hold | **否**。gif/mp4 仍是拍幻灯 |
| agent | MCP 编译 + slim prompt + 确定性 repair | **否**。没有短意图 LLM → 卡上可玩 |

world-hand 那一轮只跑了几何单测，**没有**过这四道门。

## 下一刀（质量，不再铺接口）

1. 栏宽 compose 的视觉密度（标题/图/文的投稿级间距）——不要再修图核 inset
2. 剪辑轨仍必须是插件属性；不要加关键字
3. 不要宣称 Nature 级或已超过 Claude Science

对照真源：`docs/VISION.md`。
