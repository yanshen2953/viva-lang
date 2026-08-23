# Agent handoff — viva-lang（接续任务）

> **用途：** 新建 Cloud Agent（建议模型 **Cursor Grok 4.6**）时，把本文 + 下方「复制块」一并贴进首条消息。  
> **仓库：** https://github.com/yanshen2953/viva-lang  
> **主接续分支：** `cursor/style-handbook-hook-a8c1`  
> **主 PR：** https://github.com/yanshen2953/viva-lang/pull/9（DRAFT，勿自动 merge）

---

## 1. 用户目标（北极星）

一门**语法极简、复杂度进编译器、动态插件**的 agent **内联汇报语言**，同一套原语同时做到：

1. **游戏式丰富交互**
2. **论文级精美图表**
3. **图像 / 视频级排版**

默认内联：`print-nature` + **可交互** Runtime（非静态 PNG）。

对照：`docs/VISION.md`（愿景 vs 现状）。设计真源：`docs/DESIGN.md`、`docs/PLAN.md`。**不要**宣称 Nature 级或已超过 Claude Science。

---

## 2. 当前状态（截至 2026-08-23）

| 项 | 状态 |
| --- | --- |
| 工作分支 | `cursor/style-handbook-hook-a8c1` |
| 最新提交 | 见 git log（含 handbook、CJK 折行、chrome 格内回收、旋转感知 bbox） |
| 测试 | `npm test` — 见当前 vitest；含 handbook 字号、typeGrid、CJK PDF 短语 |
| `build:lib` | `npm run build:lib` 通过 |
| CI | `.github/workflows/ci.yml`：`npm ci` / `build:lib` / `npm test` / Atlas `--visual` |
| `npm run build` | 可能因 playground/runtime 严格 tsc 失败；日常用 `vite-node` + vitest |

### PR #9 已包含的主要交付（按提交顺序）

| 主题 | 说明 |
| --- | --- |
| Style handbook hook | 任意 scene 编译期挂 handbook（`print-nature` 等） |
| Figure Atlas | `examples/figure-atlas.viva` 六 panel 虚拟临床数据 |
| 布局修复 | hyphenated role、`chart.bar` x-dodge、热图对比度、flow grid |
| 三层检查 | `src/check/` structural + visual(raster) + vision(multimodal) |
| 缓存清理 | `scripts/cleanup-artifacts.mjs`；Atlas 单张截图 |
| 默认内联 embed | `createVivaInlineEmbed()`、`builtin.viva-inline`、`docs/hosts/inline-embed.md` |
| 安装与部署 | `pack:release`、Docker、`install/one-click.sh`、`viva serve` HTTP API |
| **MCP** | `viva mcp` / `viva-mcp`；工具见 `docs/hosts/mcp.md` |
| Session API | HTTP `/api/session` + MCP `viva_session`；Pipeline `inline.set` / http-webhook |
| 缺口清单 | `docs/GAPS.md`（PLAN §1 六条胜利条件） |

### 其它开放 PR（较旧，可能已被 #9 覆盖或需合并策略）

| PR | 分支 | 备注 |
| --- | --- | --- |
| #8 | `cursor/vector-review-feedback-a8c1` | vector export + review |
| #7 | `cursor/embed-export-packages-a8c1` | embed/export 早期 |
| #6–#1 | 各 feature 分支 | 历史迭代；合并前 diff 主分支 |

**接续策略建议：** 以 **#9 分支为真源**继续；其它 PR 仅在有明确冲突/缺失时 cherry-pick，不要无计划大合并。

---

## 3. 关键路径（给新 Agent 的地图）

```
src/
  parser.ts, compiler.ts, runtime.ts, pipeline.ts
  style/          # handbook、roles（注意 mark-area 等 hyphenated role）
  check/          # structural.ts, visual.ts, vision.ts, models/
  agent/          # VivaAgentHost, http-server.ts, session, domain registry
  embed/          # inline.ts, web.ts（勿从 agent/index 拉 http-server 进浏览器 bundle）
  export/         # svg/png/pdf
  review/         # 审查模式 → agentBrief
  mcp/            # server.ts, tools.ts
examples/figure-atlas.viva   # 布局回归黄金样例
docs/CHECK.md, docs/DEPLOY.md, docs/hosts/mcp.md
AGENTS.md         # Cloud 开发命令速查
```

### Agent 接入面（用户已确认需要 MCP）

| 面 | 入口 |
| --- | --- |
| MCP（IDE） | `viva mcp`；Cursor 配置 `docs/hosts/mcp-config.example.json` |
| HTTP | `viva serve` → `/api/compile|check|export|models|prompt` |
| CLI | `viva compile|check|export|models` |
| Embed | `viva-lang/embed` + `createVivaInlineEmbed()` |

---

## 4. 验证命令（接续后应先跑）

```bash
git checkout cursor/style-handbook-hook-a8c1
git pull origin cursor/style-handbook-hook-a8c1
npm install
npm run build:lib
npm test
```

可选冒烟：

```bash
npx vite-node src/cli.ts -- check examples/figure-atlas.viva --visual --handbook print-nature
npx vite-node src/cli.ts -- serve --port 8765   # HTTP
npx @modelcontextprotocol/inspector viva mcp    # MCP（需全局安装或 npx vite-node）
```

Vision 检查需 `viva.models.json`（见 `viva.models.json.example`）或 env `VIVA_VISION_*`。

---

## 5. 建议后续工作（未完成 / 可选）

按优先级：

1. **PR #9 收尾** — CI 已加；按需把 DRAFT → ready（**仅用户明确要求时**）。勿自动 merge
2. **AGENTS.md / MCP** — 已含 `viva mcp`；现增 `viva_session` / `viva_pipeline`
3. **Playground** — 状态栏已有结构检查；浏览器内 vision/MCP 不现实
4. **Agent exam** — `npm run test:agent-exam` 需 `DEEPSEEK_API_KEY`（Pi+DeepSeek SUT）
5. **发布包实跑** — `npm run pack:release`，在干净环境验证 `release/` 与 Docker
6. **三柱推进中（未齐）** — 内联卡会画出编译错误和 structural 条（只读，不跑 visual，不自动修）。`layout.figure` 省略 gutter/margin/titleH 时按场景单位估缝和题注带（mm 不再误用 28/24px）。 `layout.figure` 可按 chrome 估 inset，并可铺满场景或 `panel: body`；`title`/`subtitle`/`caption` 由编译器画；`controls`/`bind` 出 HUD 芯片（选中亮、不另画绑定值；Atlas 已无手摆基因按钮）。`layout.board` 不写 `safe`/`titleH`/`lowerH` 时按题注折行和芯片估条带。`page: a4` 的 PDF 按页高切片并盖 `n / N`；有 `page` 时 `column` 是 89/183 mm 图栏（纸页仍是 210 mm），会被页刀切开的 figure 行整行进下一页并拉高场景；board `body:` 按栏宽折行并过页（仍不是报纸分栏）。chrome 盒子会互推一档，重叠刻度会抽稀，未加引号的多词轴题（`xLabel: Sum score`）会拼成一句而不再静默丢掉。线性轴键上作者 `xlim`/`ylim` 端点。柱/箱/小提琴的少量整数类目轴刻在取值上，不画 `xlim` 两端空位。折线/散点/矢量的整数 x 若铺满大部分域，刻在取样点（周次不再插入 5）；稀疏散点仍键端点。mm 热图色条按场景比例画，`zLabel` 在色标右侧 −90° 竖排。热图格子按相邻唯一坐标的中位步长铺格，离散数值刻度落在格心，白缝按短边比例（不再减 1 个场景单位）。长图/轴标题、图例键和色条标签按栏宽折行（折行按像素字宽、落位按场景单位，避免 89 mm 投稿图把 `单栏投稿图` 拆成 `单栏投` / `稿图`；无连字符的拉丁图例键不拆成 `treatmen` / `t`，先让 inset；Y 轴折行后自上而下阅读；色条/右图例先按场景剩余宽度让 inset，仍装不下才 `...`），热图可用 `zLabel`/`zUnit`，相邻格 chrome 互叠时再长 inset；软顶装不下时 inset 可再长到约半格。有效 brush 松手后保持选择窗；路径够长切数据域套索。`__event.x/y` 是作者场景单位（mm 投稿图不再二次缩放刷选/tip）。跟手 `chartTip` 绑 `__tipX`/`__tipY`，空 `__tip` 不画；HUD/brush 不抢指针。paper-cjk / paper-column / paper-pages / paper-spread / paper-linked-pages / paper-board-linked / paper-storyboard / paper-linked-marks / figure-grid / figure-span / box / violin / time-axis / brackets 默认可交互。热图均值、漏斗合计和矢量位移按 `__sel` 重算。分页 `chartTip` 夹在当前 A4 页带，folio 不抢指针。多页 folio 奇数靠右、偶数靠左（对页页戳，仍不是章节标）。`paper-linked-pages` 用同一套 `__sel` 让第 1 页 visit 刷选重算第 2 页 box。绑了 `panel: right` 的 figure 也会按页刀跳行；`paper-board-linked` 把 board 安全框、A4 页刀和跨页 box 重算放在同一件（拉高后 lower 跟到最后一页，仍不是对页排版器）。play 遮罩全部 `pointer-events: none`；`paper-storyboard` 是 183×103 mm 分镜 + play + 跨拍 `__sel`（暗拍也可刷选，仍不是时间轴）。box 会按 `__sel` 行重算四分位。高亮点会放大并和藏行一起缓 220ms；`play` 拍遮罩走同一条 CSS opacity，仍不是时间轴。`--beats -f gif|mp4` 是 ffmpeg 拼 `__beat` 栅格幻灯，不是剪辑成片。单图省略 `areaX`/`areaY` 时停在作者节点/手写 frame 腾出的最大空矩形；作者 `role: panel` / `role: plot` 升成同名 frame；省略 `x/y/w/h` 且写了 `panel:` 的作者节点填进该槽（`role: plot` 吃 figure cell，不叠空格图表 inset）；`science-studio` 文案/四宫格吃 `layout.board` + `layout.figure`（`body:` 折进 `left`），矢量场改 `chart.vector`，PCA 投影走 `pcaPlotBg` frame；PCA 点默认吃图表同一套 `__tip` / 高亮 / `__sel`，`colorBy` 图例、plot title 和数值 `+`/`-` 芯片由编译器画，拖轨道仍不绑 brush。仍欠：栏宽重排、时间轴动画、CJK 全库、成片视频、LLM 生成率。对照 `docs/VISION.md`。**不要**标愿景完成。

### 已知约束 / 坑

- `web.ts` embed bundle **不能** import `agent/index`（会拉入 resvg/sharp）
- 结构检查用 `withIrStyleContext`，palette 才与 Runtime 一致
- `overlapPairIgnored` / `isChromeNode` 对 Atlas 有专门豁免，改检查逻辑要跑 Atlas 测试
- Cloud Agent **分支名** 新建时用 `cursor/<descriptive-name>-a8c1`
- 用户规则：**中文回复**；若涉及 GPU 训练/推理指定 **`cuda:0`**

### 刻意未做

- Playground 内跑 vision 检查
- MCP 生产环境鉴权（stdio 本地由宿主管理）
- 自动 merge 其它开放 PR

---

## 6. Git / PR 规范（Cloud Agent）

- 推送：`git push -u origin <branch>`
- 每个逻辑变更单独 commit；**不要** force push / amend（除非用户要求）
- 用 `ManagePullRequest` 创建/更新 PR；默认 **draft**
- **不要** `gh pr merge` 或 mark ready，除非用户明确说

---

## 7. 复制块（贴进新 Agent 首条消息）

```
请接续 viva-lang 任务。先读仓库内 docs/HANDOFF.md 和 AGENTS.md。

仓库：https://github.com/yanshen2953/viva-lang
分支：cursor/style-handbook-hook-a8c1
PR：https://github.com/yanshen2953/viva-lang/pull/9

目标：一门极简内联汇报语言，同时覆盖游戏交互 × 论文图表 × 影像排版；复杂度进编译器；动态插件；服务 coding agent。对照 docs/VISION.md。默认内联 print-nature 可交互卡片。

请先：checkout 分支 → npm install → npm run build:lib → npm test。

然后按 HANDOFF.md §5 建议后续工作继续；以 #9 分支为真源。中文回复。GPU 任务用 cuda:0。

不要自动 merge PR；改动后 commit、push、更新 PR #9。
```

---

*本文件由前序 Cloud Agent 生成，用于 Grok 4.6 等新模型接续。*
