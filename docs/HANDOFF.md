# Agent handoff — viva-lang

> **用途：** 新开 Cloud Agent / 新 chat 时，先读本文 + `AGENTS.md`，再把文末「复制块」贴进首条消息。  
> **仓库：** https://github.com/yanshen2953/viva-lang  
> **真源分支：** `cursor/style-handbook-hook-a8c1`  
> **主 PR：** https://github.com/yanshen2953/viva-lang/pull/9（**DRAFT，勿 merge，勿 mark ready**）  
> **对照：** `docs/VISION.md`（愿景 vs 现状）· `docs/GAPS.md`（诚实缺口）· `docs/DESIGN.md` / `docs/PLAN.md`（设计真源；PLAN §1 里「1–3 已齐」**过满**，以 GAPS 为准）

---

## 0. 给新对话的人

上一轮用户说了 **「停掉现在的 /goal」**。那条 durable goal（状态栏摘要类似「做成新语法」）**没有**被标 `complete`，因为四柱没做完。桌面 / Cloud 状态栏中间那条 **没有暂停按钮**；文档里唯一的 pause 是 CLI `Ctrl+C`。开新 chat 是在试：栏上那条会不会自己消失。

**新 Agent 不要自己 `CreateGoal`。** 用户没再发 `/goal …` 之前，当普通任务做，不要把四柱重新武装成 durable goal。

---

## 1. 北极星（不要缩小）

一门 **新的 agent 内联汇报语言**，同一套极小原语 **同时** 做到：

1. **游戏式丰富交互**（图用同一套 Runtime；默认数据域 tooltip / brush / 跨面板高亮）
2. **论文级精美图表**（mm / 栏宽、PDF/CJK 可读、完整轴语义、Atlas 无魔法数）
3. **图像 / 视频级排版**（`layout.board` 安全框、lower-third、分镜槽）

约束必须一直为真：

- 语法和原语极小；复杂度进编译器 / Runtime
- 动态插件：`registerWidget()`，**不加新关键字**
- 服务 coding agent（CLI / MCP / HTTP / SDK / embed）
- 默认内联：`print-nature` + **可交互** Runtime，不是静态 PNG
- **不要**宣称 Nature 级或已超过 Claude Science，除非三柱质量都真的齐

对齐定义：一处改动只有让上述终态更真，才算对齐。不要用「更好测 / 更安全 / 更小」的替代品换掉终态。

---

## 2. 快照（2026-08-24）

| 项 | 值 |
| --- | --- |
| 分支 | `cursor/style-handbook-hook-a8c1` |
| HEAD | 手册文法 / 逐拍 hold / repair 扩补 / 拖参环（接续 `79374f4`） |
| 工作树 | 本轮剩余缺口已进编译器，见 §3 / §4 |
| 测试 | 本轮本机 `npm test`：**306 passed** |
| `build:lib` | 通过 |
| CI | `.github/workflows/ci.yml`：`npm ci` / `build:lib` / `npm test` / Atlas `--visual`。`dba0a84` 当时绿 |
| `npm run build` | playground/runtime 严格 tsc 仍可能失败；日常用 `vite-node` + vitest |
| 用户语言 | **中文回复**；GPU 只用 `cuda:0` |

其它开放 PR（#8…#1）较旧。**以 #9 分支为真源**；不要无计划大合并。

---

## 3. 本轮已落地（相对接口堆砌；仍不是愿景齐）

按主题，不是按 commit 流水账。细节与考试在 `docs/GAPS.md` / `tests/exam/`。

| 主题 | 现在的行为 | 仍不是 |
| --- | --- | --- |
| Handbook | 编译期挂 `print-nature` / `dashboard`；手册在 widget **之后**上色。`print-nature` 的 plot / deck / plate / 柱 `radius: 0`；`dashboard` 仍是 6 / 3。可选 `plotRadius` / `barRadius` | 手册不执行避让 / 栏宽文法 |
| Figure Atlas | `examples/figure-atlas.viva` 六 panel；HUD 芯片按 10pt `hud` 字宽（`CD8A`/`IL6`，下限 56，挤时 48）；plot 槽芯片不再 `min(36, …)` | OCR 仍可能读错芯片字 |
| 热图 | 格心刻度、中位步长铺格、短边 5% 缝、Y 第一行在顶、无笛卡尔虚线；色条按 `zlim` 刻（`0 4` → `4 3 2 1 0`）、短刻度线、顺序色 **一条** `linearGradient`（Runtime + 静态 SVG 共用 `gradientSpec`）；格子连续 `clamp(norm * 6, 0, 6)` | 不是 Nature CIE 色条 |
| 轴 | 未加引号多词轴题拼成一句；线性轴键端点；`print-nature` 的 `maxMajorTicks` / `minorTicks` / `plotFloor` 进 expand；log/linear/time 和色条画次刻度 | 不是 Nature 轴文法 |
| 矢量 | 场景三角箭头 + 绘图区比例尺 | 不是带单位换算的 quiver |
| 排版 | chrome inset + 位姿同一残差循环；手册 typography 驱动折行/字号；色条有脊线；正文绕 figure，重叠则 hop | 不是 InDesign |
| 交互 | play 是 hold+ease，可写 `holds:`；`__view` 有转移/守卫；导出可读 `__easeU` 采 220ms | 不是剪辑时间轴 / 完整游戏 SM |
| Agent 面 | overflow / 空栏 / 轴确定性 repair；内联 + domain browser visual；`attachDragParamLoop`；离线 exam 种子编译率在 CI | visual 仍不挡成功；LLM 生成率未测 |

最近相关提交（新 → 旧，便于 `git log`）：

```
dba0a84  print-nature 方角柱；dashboard 仍圆角
873a7e3  语言文档记下 10pt HUD
35f4759  芯片按 10pt 估宽，不再 8pt/44 下限
a1da5e1  print-nature 方角 plot/deck/plate
1a4c131  热图不画笛卡尔虚线
feac290  色条一条 sequential linearGradient
be4394f  顺序色插值 / 连续 heat tier
ab659f7  色条刻在 zlim，不是三段色块端
8888866  热图 row 0 在顶
2a5ba01  矢量头场景三角
```

---

## 4. 仍未齐（四柱，用户可见质量）

完成审计必须逐条对着当前树证明，不能靠「接口在」或「考试绿」。

### 4.1 出版级排版求解

- 标题 / 轴 / 图例 / 色条 / `(a)` 已用同一残差向量长 inset；`placePaperChrome` 位姿也是残差循环。手册 typography 进 chrome
- 色条有左右脊线。CJK 缺字进导出 `missingGlyphs`。观感仍粗

### 4.2 时间轴 + 完整 linked view

- `play` 是 hold+ease 时钟；`holds:` 是逐拍插件属性。导出 `__easeU` 与 Runtime 同一套 220ms
- `__view` 有转移/守卫和 page。仍不是完整游戏 SM / NLE

### 4.3 报纸 + 成品视频

- 正文会绕 figure 过页；重叠时 figure hop。subtitle 章节标；`→ n+1` 跳页。仍不是 InDesign
- 成片仍是时钟采样，不是 NLE

### 4.4 Agent 闭环

- visual QA **附着但不挡** IR 成功（未改）
- 内联卡跑 IR 级 browser visual（警告，不引 resvg）
- session 对 overflow / 空栏绑 data / 补 xLabel·yLabel / 删手写 tick 做确定性 repair
- 离线 `examples/exam/*.viva` 编译率在 CI；`test:agent-exam` 仍要 key
- `attachDragParamLoop` 是宿主胶水，不是语言关键字

**建议下一刀（不缩小北极星）：**

1. figure 与正文同一文档流（现在是 punch + hop，不是 InDesign）
2. 用 key 跑 `test:agent-exam` 测 LLM 生成率
3. 剪辑级成片仍必须是插件属性；不要加关键字

---

## 5. 硬约束（接续时不要破）

- **不要**全局关掉词中折行
- **不要**让 visual 检查失败 IR 成功（除非用户以后明确要求，且误报已降）
- **不要**加关键字：`figure` / `panel` / `colorbar` / `safe` / `lowerThird`
- **不要**把 play 遮罩写成 `role: hud`
- **不要** merge PR #9，不要 mark ready（除非用户明说）
- `src/embed/web.ts` **不能** import `agent/index`（会把 resvg/sharp 打进浏览器）
- Handbook 在 widget 之后；`print-nature` 的 `.*Title$` → `title` **不覆盖**节点上已写的 `role`
- 共享 bbox：`src/layout/node-bbox.ts`；审查必须先 `scaleSceneGeom`；frame 映射过的属性不要再 scale
- `__event.x/y` 是 **作者场景单位**（`unit: mm` 时是毫米）
- 语言 **没有** 三元 `? :`；eval 有 `floor` / `clamp` / `min` / `max`；任一侧是字符串则 `+` 拼接
- `parsePropLine` 收齐一行上 **所有** expr
- `fieldLooksCategorical` **只看字符串**；整数 visit/week/col 保持线性，除非 `xTickVals` / band cats
- Atlas 柱图例在 **格内、绘图区右侧**（plot ~255，legend ~261）是投稿位置，不是「图例画进数据」
- `styleSkip: true` 跳过手册上色
- 热路径：`src/check/index.ts` 的 `attachHotPathVisual`；MCP/HTTP 附 raster；**不挡 IR 成功**。内联卡 structural + `runBrowserVisual`（`src/check/browser-visual.ts`，不引 resvg）
- 时钟：`src/timeline/clock.ts`；repair：`src/repair/deterministic.ts`
- 保持 `interactive: false` 的 exam / MCP / HTTP fixture **不要**擅自改成 live
- Cloud 新建旁支：`cursor/<descriptive-name>-e94d`（本任务继续用已有 `cursor/style-handbook-hook-a8c1`）

---

## 6. 代码地图

```
src/
  parser.ts  compiler.ts  runtime.ts  pipeline.ts  widgets.ts  paint.ts
  style/           handbook、roles（hyphenated：mark-area）
  layout/          node-bbox、board-chrome、chrome collide
  check/           structural / visual / vision；热路径不挡成功
  agent/           Host、http-server、session（web.ts 勿再进口）
  embed/           inline.ts、web.ts、inline-check.ts
  export/          svg / png / pdf；static-svg 的 linearGradient
  review/          审查 → agentBrief
  mcp/             server.ts、tools.ts
examples/
  figure-atlas.viva          布局黄金样例
  paper-*.viva               投稿 / 分页 / 分镜 / 跨页 __sel
  science-studio.viva        board + figure，无手摆魔法数
tests/exam/
  figure-atlas.test.ts       柱 1–6、周次无 5、热图、色条、方角、HUD
  chart-quality.test.ts      热图 / 矢量 / 色条 gradient / 圆角手册
  board-chrome.test.ts       measureChipWidth("CD8A") >= 56
  vision-pillars.test.ts     三柱骨架，不是愿景完成证明
docs/LANGUAGE.md             语言表面（给人和模型）
```

插件发现：`viva widgets` / `listWidgets()`。

---

## 7. 接续后先跑

```bash
git checkout cursor/style-handbook-hook-a8c1
git pull origin cursor/style-handbook-hook-a8c1
npm install
npm run build:lib
npm test
```

质量回归（改图核 / 手册 / 导出时）：

```bash
npx vitest run \
  tests/exam/vision-pillars.test.ts \
  tests/exam/figure-page.test.ts \
  tests/exam/chart-quality.test.ts \
  tests/exam/chrome-collide.test.ts \
  tests/exam/figure-atlas.test.ts \
  tests/exam/export.test.ts \
  tests/exam/space-widgets.test.ts \
  tests/exam/board-chrome.test.ts

npx vite-node src/cli.ts -- export examples/paper-linked-marks.viva -f png -o /tmp/plm.png --handbook print-nature
npx vite-node src/cli.ts -- export examples/figure-atlas.viva -f png -o /tmp/atlas.png --handbook print-nature
npx vite-node src/cli.ts -- check examples/figure-atlas.viva --visual --handbook print-nature
```

Vision 要 `viva.models.json` 或 `VIVA_VISION_*`。Agent exam 要 `DEEPSEEK_API_KEY`。

---

## 8. Git / PR

- 推送：`git push -u origin cursor/style-handbook-hook-a8c1`（网络失败指数退避最多 4 次）
- 每个逻辑变更单独 commit；**不要** force push / amend（除非用户要求）
- 用 `ManagePullRequest` 更新 PR #9；读现有 body，**保留人类改过的段落**
- **不要** `gh pr merge` / 开 auto-merge / mark ready

---

## 9. 复制块（贴进新 Agent 首条消息）

```
请接续 viva-lang。先读 docs/HANDOFF.md 和 AGENTS.md，再读 docs/VISION.md、docs/GAPS.md。

仓库：https://github.com/yanshen2953/viva-lang
分支：cursor/style-handbook-hook-a8c1
PR：https://github.com/yanshen2953/viva-lang/pull/9（DRAFT）
HEAD（写 handoff 时）：dba0a84

北极星：一门极简内联汇报语言，同时覆盖游戏交互 × 论文图表 × 影像排版；复杂度进编译器；动态插件；服务 coding agent。默认内联 print-nature 可交互卡片。不要宣称 Nature 级。

上一轮用户已停掉 /goal。不要 CreateGoal，除非我再发 /goal。

请先：checkout 该分支 → npm install → npm run build:lib → npm test。
然后按 HANDOFF.md §4 的下一刀继续，不要缩小北极星，也不要用「更好测」的替代品换终态。
中文回复。GPU 只用 cuda:0。
不要 merge / mark ready。改动后 commit、push、更新 PR #9（保留我改过的 PR 正文）。
```

---

*本文件 2026-08-24 由 Cloud Agent 按当时工作树重写，供新 chat / 新模型接续。*
