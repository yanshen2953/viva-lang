# 目标差距（诚实版）

北极星：一门极简内联汇报语言，同时覆盖游戏交互 × 论文图表 × 影像排版；复杂度进编译器；动态插件。对照 `docs/VISION.md`。

前序清单把 PLAN §1 的 1–3 标成「齐」，**过满**。接口在，产品观感仍粗。本文以用户可见质量为准。

评估：2026-08-26。分支 `cursor/roadmap-r1-f1b5`（基于 `main` `a469dff`）。接续说明：`docs/HANDOFF.md`。

## 2026-08-26 复评：四道门已过，但过的是地板

`npx vitest run` 50 文件 375 测试全绿，含真浏览器与 live LLM：

| 门 | 证据 | 阈值 |
| --- | --- | --- |
| 眼睛 | `arrival 3`：`pdftoppm` 栅格化真 PDF，与 SVG 叠 ink mask | `minInkIou > 0.55`，`maxMse < 0.45` |
| 手 | `browser-arrival`：真 Puppeteer 一会话 brush → World 拖 → `n`/`N` → 跳页 → 暗拍再刷 | 状态不断 |
| 导出 | `arrival 4`/`arrival 7`：PDF 有 rotate/dash/clip/fill；painted id 对齐 Runtime / SVG / sidecar / review | `sidecarOverlap > 0.85` |
| agent | `browser-generated-arrival`：live 生成件在真浏览器过同一套；不灌 `LANGUAGE.md` | 禁用 `simulate()` |

所以下表里 2026-08-24 那版「四门全否」已经不成立。但 `0.55` 的 ink IoU 是**地板不是画质**：它只证明 SVG 与 PDF 画的是同一张图，没有证明间距达到投稿水平。

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
| `layout.board` | `safe`/`title`/`body`/`lower`/`hud`；题注 + `controls`/`bind` 芯片（选中亮、不另画绑定值）；不写 `w/h` 铺满场景；不写 `safe`/`titleH`/`lowerH` 时按题注折行和芯片估条带；`splits` / `beats` / `bleed` / `typeGrid`；`--beats` 出 hold 中点 PNG；GIF/MP4 按 timeline fps 采完整 Clock hold+ease |
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

怎么知道自己到了，而不是又「接口齐」：同一份极小源码过眼睛 / 手 / 导出 / agent。系统审计与退出条件见 [`ARRIVAL_AUDIT.md`](./ARRIVAL_AUDIT.md)；地板在 `tests/exam/four-gates.test.ts`。

| 门 | 地板（CI 锁住） | 到站？ |
| --- | --- | --- |
| 眼睛 | 89 / 183 mm 的 SVG 与矢量 PDF 同宽；`arrival 3` 用 `pdftoppm` 栅格化真 PDF 每页与 SVG 叠 ink mask | **地板过**。`minInkIou > 0.55` 只说明同构，不说明投稿间距 |
| 手 | `browser-arrival`：真浏览器一会话 brush → World 拖 → `n`/`N` → 跳页 → 暗拍再刷，`__sel`/`__beat`/`__page` 逐步断言 | **过**。禁用 `simulate()` |
| 导出 | painted `data-viva-id` 对 flatten / SVG / PDF sidecar / review；beat PNG 取 hold 中点；gif/mp4 跟完整 Clock playback；PDF 有 rotate/dash/path/clip | **地板过**。painted/logical 契约仍靠测试侧 `nodePainted()` 过滤 |
| agent | `browser-generated-arrival`：live 短意图生成件在真浏览器过同一套；slim prompt 不含 `LANGUAGE.md` | **过** |

## 十个工作包结账（对 `ARRIVAL_AUDIT.md` §到站需要的十个工作包）

| 包 | 状态 | 依据 / 缺口 |
| --- | --- | --- |
| P0-A 统一字体度量 | **基本齐** | `measureText` 是 Helvetica AFM + CJK 1 em。`tests/exam/text-ruler.test.ts` 把布局尺对浏览器 `getComputedTextLength()` 和 PDF 真宽卡 2% 硬阈值。仍缺节点级 `getBBox()` 对盒（`EXAM_PLAN.md` R1-B） |
| P0-B PDF paint 保真 | **基本齐** | rotate/dash/clip/fill/gradient + 每页 ink IoU + cmap 验字。filter / blend 的矢量降级策略仍未写明 |
| P0-C 规范到站件 | **齐** | `examples/arrival.viva`，四门只吃它 |
| P0-D Runtime 世界坐标 | **齐** | `__event.x/y` 在 mm 场景是 mm；mark 上可起刷；collide 带 phase |
| P0-E 浏览器构建与发布 | **齐** | `npm run build` 绿；npm pack / Docker smoke 在 `arrival 8` |
| P1-F 真浏览器考试 | **齐** | `browser-arrival.test.ts` |
| P1-G Runtime 页面导航 | **齐** | `writePage`/`readPage`，浏览器考试断言跳页 |
| P1-H 关闭 agent 环 | **齐** | `agent-loop` + `browser-generated-arrival` |
| P1-I 插件生命周期 | **齐** | `registerCompileHook({ after })`，外部 widget 不改 core，见 `arrival 9` |
| P2-J ID / 隐藏节点契约 | **部分** | sidecar 有 `{id,page,bboxPt}`；但 logical vs painted 未定义，测试仍需过滤 `nodePainted()` |

## 还差多少（按用户可见排序）

到站门已过，剩下的是**画质与语义**，不是接口：

1. **投稿间距没有验收尺**。ink IoU 0.55 能通过一张明显偏松的图。要把阈值往 0.9 推，并给 rotated 轴题、连续色条、violin 轮廓单独 fixture。
2. **预测 bbox 没有对过真渲染**。布局用 Helvetica AFM，Runtime 用浏览器字体栈，两者从未卡过误差阈值。这是 P0-A 唯一没做的验收项，也是「间距像印的」不能验收的根因。
3. **logical / painted 契约未定**。`visible: false`、`opacity: 0`、ease 中间态属于哪一集没写死，测试靠过滤兜住。
4. **linked view 不完整**。`__sel` 能跨面板藏行重算摘要，仍不是完整联动选择，无动画过渡。
5. **排版不是栏宽重排器**。`typeGrid` 与 figure 共用度量，仍不是跨页报纸成品。
6. **play 不是 NLE**。有 `holds`/`ins`/`outs`/`order`/`cuts`/`tracks`，没有音轨和转场。
7. **世界手不是物理引擎**。能握、能顶、能滑墙、能套索，不是刚体栈。
8. **filter / blend 在 PDF 的降级没写明**。
9. **`attachDragParamLoop` 要宿主自己挂**，没有默认 watch。

## 下一刀

分组路线、每轮阈值和验收判据见 [`EXAM_PLAN.md`](./EXAM_PLAN.md)。

R1-A（三把尺互测）已完成：`tests/exam/text-ruler.test.ts`。它抓到的第一个真缺陷是 PDF 整串用一种字体，`夜港 HARBOR` 里的 Latin 被 CJK 字体加宽，与布局和浏览器差 20.6%；改成按字体分段绘制后降到 0.9%。P0-A 的验收第 2 条由此闭合。

余下按 `EXAM_PLAN.md` 的 R1-B / R1-C 起步，不要加关键字，不要宣称 Nature 级或已超过 Claude Science。

完整工作包与退出条件：[`ARRIVAL_AUDIT.md`](./ARRIVAL_AUDIT.md)。
