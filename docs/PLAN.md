# Viva 超越计划（PLAN）— 通用 Agent 接口补全版

> 目标：在 **IDE/对话内联透视与汇报** 上，相对 Cursor 内联面板、Codex、Claude Code、Claude Science 的内联产物，形成**可演示的代差优势**。  
> 设计真源：`DESIGN.md`。本文是可执行计划与**冻结级接口契约**。  
> 原则：**核做活世界；流水线 / 领域视图 / 可追溯做一等接口**——不重造整个科学工作台，但要把它们接进同一 Agent 表面。  
> 状态：接口契约草案 v2（相对初版补全：宿主门面、事件总线、适配器、验收矩阵）。

---

## 0. 代差目标（「彻底超过」的精确定义）

### 0.1 不赢 / 必赢

| 轴 | 不宣称超过 | 必超过（交付后） |
| --- | --- | --- |
| 领域 3D / genome / BioNeMo | Claude Science | — |
| 任意统计库一次性出图 | Python/R | — |
| HPC / 可重复分析工作台 | Science workbench | — |
| IDE 内联「代码跑出的图」 | — | Cursor / Codex / Claude Code |
| 内联「可编译活世界」（交互×状态×时间×度量） | — | 全部编码代理内联路径 |
| 同一表面接流水线 + 领域视图 + 可追溯 | — | 常见代理「附件式」产物 |

**对外口号（仅当 §1 全齐）：**  
「内联活世界 + 可插拔分析 / 领域 / 审计」——不是「替代 Claude Science」。

### 0.2 相对对手的接口代差

| 能力 | Cursor / Codex / Claude Code | Claude Science | **Viva Agent 表面** |
| --- | --- | --- | --- |
| 产物形态 | Markdown / 临时 HTML / 脚本图 | 领域工作台 + 历史 | **可编译 `.viva` → Runtime 挂载** |
| 多轮修改 | 改代码 / 重跑 | 改分析步骤 | **`patch` + statePolicy** |
| 交互 | 浅或无 | 领域查看器为主 | **World 一等：drag/collide/tick/key** |
| 流水线 | 终端旁路 | 工作台内置 | **`PipelinePort` 一等接口** |
| 领域重视图 | 无 / iframe 临时 | 内置强 | **`DomainView` 槽位 + 选中桥** |
| 可追溯 | 对话日志 | 工作台 history | **`ProvenanceWriter` 绑定 Viva 语义** |
| 宿主绑定 | 各家私有 | 绑定 Anthropic 产品 | **`VivaAgentHost` 宿主无关** |

---

## 1. 胜利条件（对外可说「强得多」之前）

必须同时成立：

1. **内联活世界**：宿主面板内可编译、热更新、交互（拖/点/tick）一份 `.viva`。  
2. **度量科学图**：`frame` + `scale` + `chart.*`，无魔法数。  
3. **通用 Agent 接口**：任意编码代理用同一套 API 挂载（非只绑 Cursor）。  
4. **流水线接口**：外部分析（Python/R/作业）可推数据进 artifact，交互可回写参数。  
5. **领域视图接口**：蛋白/基因组等重视图以插件槽位嵌入，与 Viva 场景并存、可互链选中。  
6. **可追溯分析接口**：每次生成/运行留下可审计 provenance（prompt 摘要、handbook、源码、数据指纹、事件日志）。

未齐 **1–6**，禁止市场口径「全面超过 Claude Science」。可说「交互世界轴已超过常见编码代理内联」。

**现状对照（2026-08-24）：** 见 [`GAPS.md`](./GAPS.md)（诚实版：1–3 **未齐**）。4–6 接口对外（HTTP/MCP/CLI）已接，端到端演示与重领域插件未齐。接续：[`HANDOFF.md`](./HANDOFF.md)。

---

## 2. 系统形态

```
┌──────────────────── Host Agent (Cursor / Codex / Claude Code / Science / 自研) ──┐
│  createVivaAgentHost(...)                                                         │
│  ┌─ Session ── compile / patch / mount / world ───────────────────────────────┐ │
│  ┌─ Prompt   ── buildPromptBundle / assertVivaSource ─────────────────────────┐ │
│  ┌─ Pipeline ── PipelinePort ─────────────────────────────────────────────────┐ │
│  ┌─ Domain   ── DomainViewRegistry ───────────────────────────────────────────┐ │
│  ┌─ Provenance ── ProvenanceWriter / exportBundle ────────────────────────────┐ │
│  └─ Events   ── HostEventBus（统一订阅）──────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────────┘
         │                    │                      │
         ▼                    ▼                      ▼
  Viva Runtime         Pipeline Adapters      Domain View Plugins
  World/Space/Paint    (local/http/queue)     (iframe/img/mol*/genome*)
         │                    │                      │
         └────────────────────┴──────────────────────┘
                         Provenance Store
```

Viva **拥有**中间交互编译运行时；**编排**两侧流水线与领域视图；**记录**一切可追溯事实。

---

## 3. 通用 Agent 宿主接口（冻结契约）

包路径：`src/agent/`（对外可 re-export 为 `viva-lang/agent`）。

### 3.1 门面：`VivaAgentHost`

所有宿主（含 playground）**只**通过门面创建能力，禁止直接 new Runtime 分叉两套路径。

```ts
/** 一次 Host = 一个 IDE 面板 / 对话内联容器的能力总线 */
interface VivaAgentHost {
  readonly id: string;
  createSession(opts: CreateSessionOptions): VivaSession;
  getSession(id: string): VivaSession | undefined;
  listSessions(): VivaSession[];

  /** LLM 调用前组装 */
  prompt: PromptService;

  /** 流水线 / 领域 / 可追溯 —— 与 session 共享同一 bus */
  pipeline: PipelinePort;
  domains: DomainViewRegistry;
  provenance: ProvenanceWriter;

  events: HostEventBus;
  dispose(): void;
}

function createVivaAgentHost(opts?: {
  provenance?: ProvenanceWriter;
  pipeline?: PipelinePort;
  domains?: DomainViewRegistry;
}): VivaAgentHost;
```

### 3.2 会话：`VivaSession`

```ts
type HandbookId = string;
type StatePolicy = "reset" | "preserve" | "preserve-data";

interface CreateSessionOptions {
  mount?: HTMLElement | null;   // null = 无头（CLI / 批处理 / 单测）
  handbooks?: HandbookId[];
  statePolicy?: StatePolicy;    // 默认 "preserve-data"
  title?: string;
  /** 若省略则继承 host.provenance */
  provenance?: ProvenanceWriter;
}

interface CompileMeta {
  reason?: "generate" | "repair" | "user-edit" | "pipeline" | "restore";
  promptDigest?: string;
  modelId?: string;
  handbooks?: HandbookId[];
}

interface CompileResult {
  ok: boolean;
  diagnostics: Diagnostic[];
  sourceHash: string;
  irHash?: string;
  /** 失败时仍可返回上次成功 IR，便于宿主展示红线 */
  ir: VisualIR | null;
}

interface VivaSession {
  readonly id: string;
  readonly hostId: string;

  compile(source: string, meta?: CompileMeta): CompileResult;
  patch(source: string, meta?: CompileMeta): CompileResult;
  getSource(): string;
  getIR(): VisualIR | null;

  getWorld(): { state: unknown; data: unknown };
  setData(path: string, value: unknown): void;
  setState(path: string, value: unknown): void;
  /** 点路径订阅（领域桥 / 流水线回流用） */
  watch(path: string, cb: (v: unknown) => void): () => void;

  on(event: SessionEventType, cb: (e: SessionEvent) => void): () => void;

  exportSvg(): string;
  snapshot(): ArtifactSnapshot;
  dispose(): void;
}

interface ArtifactSnapshot {
  sessionId: string;
  ts: number;
  source: string;
  sourceHash: string;
  irHash?: string;
  state: unknown;
  data: unknown;
  handbooks: HandbookId[];
  svg?: string;
}
```

### 3.3 多轮补丁契约

| 策略 | 行为 | 典型场景 |
| --- | --- | --- |
| `reset` | 新源码全新 runtime | 用户说「推倒重来」 |
| `preserve` | 重编译后合并同名 state 键 | 改布局但保留滑块值 |
| `preserve-data` | 只保留 data，state 重置 | 流水线灌数后换图模板 |

硬规则：

1. 每次 `compile` / `patch` 必须 `provenance.append`。  
2. `patch` 失败：**不销毁**上一成功 runtime（除非 `reset` 且用户确认）。  
3. diagnostics 进入 `PromptService` 的 repair 上下文。

### 3.4 Prompt 服务

```ts
interface PromptBundle {
  coreSystemPrompt: string;
  handbooks: { id: HandbookId; body: string }[];
  repairContext?: string;
  /** 给宿主拼 messages 用的稳定顺序 */
  asSystemParts(): string[];
}

interface PromptService {
  buildPromptBundle(ids?: HandbookId[], repair?: Diagnostic[]): PromptBundle;
  assertVivaSource(text: string): string;  // 剥 fence、拒非源码
  listHandbooks(): { id: HandbookId; title: string; path: string }[];
  loadHandbook(id: HandbookId): string;
}
```

### 3.5 会话 / 宿主事件总线

```ts
type SessionEventType =
  | "compiled"
  | "patched"
  | "compile-error"
  | "world-change"     // state/data 变更（可节流）
  | "user-interact"    // 聚合后的交互摘要
  | "disposed";

type HostEventType =
  | SessionEventType
  | "pipeline-start"
  | "pipeline-end"
  | "domain-selection"
  | "provenance-append";

interface SessionEvent {
  sessionId: string;
  type: SessionEventType;
  ts: number;
  detail?: unknown;
}

interface HostEventBus {
  on(type: HostEventType | "*", cb: (e: HostEvent) => void): () => void;
  emit(e: HostEvent): void;
}
```

### 3.6 宿主无关 + 适配器

- 核只依赖：`mount?: HTMLElement` + JS。  
- CLI / Node：无 mount，仅 compile / snapshot / provenance。  
- 各产品薄适配器（文档 + 示例，非核依赖）：

```ts
/** 适配器只做：找 DOM、调模型、转发事件 —— 不复制编译逻辑 */
interface HostAdapter {
  readonly name: "cursor" | "codex" | "claude-code" | "claude-science" | "playground" | string;
  mountRoot(): HTMLElement | null;
  requestCompletion(bundle: PromptBundle, user: string): Promise<string>;
  attach(host: VivaAgentHost): void;
}
```

**Dogfood 规则：** `playground/main.ts` 必须实现 `HostAdapter` 并只经 `VivaAgentHost` 驱动。

---

## 4. 流水线接口（Pipeline Port）— 冻结契约

**目标：** 分析在外执行，Viva 负责演与问；参数可回流。对标 Science「跑一步分析」，但接口化、可替换。

```ts
interface PipelinePort {
  register(def: PipelineDef): void;
  unregister(id: string): void;
  list(): PipelineDef[];
  run(id: string, input?: PipelineInput): Promise<PipelineHandle>;
  cancel(runId: string): Promise<void>;
  get(runId: string): PipelineHandle | undefined;
}

interface PipelineDef {
  id: string;
  title: string;
  description?: string;
  /** 输出 → Viva data/state */
  outputs: PipelineBinding[];
  /** 可选：从 world / 上次事件取样 */
  inputs?: PipelineBinding[];
  launch: (ctx: PipelineContext) => Promise<PipelineResult>;
}

interface PipelineBinding {
  name: string;
  target?: "data" | "state";           // outputs 必填 target
  from?: "data" | "state" | "event";   // inputs 必填 from
  path: string;
  schema?: JsonSchema;
}

interface PipelineContext {
  session: VivaSession;
  input: PipelineInput;
  signal: AbortSignal;
  log: (line: string) => void;
}

interface PipelineInput {
  values?: Record<string, unknown>;
  /** 覆盖从 world 自动取样 */
  overrides?: Record<string, unknown>;
}

interface PipelineResult {
  runId: string;
  status: "ok" | "error" | "cancelled";
  values?: Record<string, unknown>;
  artifacts?: PipelineArtifact[];
  logUri?: string;
  error?: string;
}

interface PipelineArtifact {
  name: string;
  uri: string;
  mediaType: string;   // text/csv, application/x-pdb, image/png…
  /** 可选：自动丢给 DomainView */
  suggestDomainView?: string;
}

interface PipelineHandle {
  runId: string;
  pipelineId: string;
  sessionId: string;
  status: "running" | "ok" | "error" | "cancelled";
  result?: PipelineResult;
}
```

### 4.1 约定（硬）

1. Viva **不内置** SLURM / BioNeMo / 具体生物工具；只定义 port。  
2. `status === "ok"` 时：按 `outputs` 自动 `setData` / `setState`，再 `provenance.append({ kind: "pipeline" })`。  
3. `artifacts` 中带 `suggestDomainView` 的，Host 可提示打开对应 DomainView。  
4. 语言侧极薄挂钩（阶段 E 后半）：`event … pipeline: <id>` 或 widget `pipeline.run` —— **不得**把具体工具名写进关键字表。  
5. 首发适配器：`local-command`（子进程）+ `http-webhook`；Science 适配只写文档示例。

### 4.2 回流（交互 → 分析）

```
用户拖参数点 → state.param 变 → PipelineBinding from:state
→ 用户点「重跑」或 debounce 自动 run → values 灌回 chart data
```

验收：改一个点，重跑脚本，图变，provenance 有两条 `interact`（聚合）+ `pipeline`。

---

## 5. 领域视图接口（Domain View Slot）— 冻结契约

**目标：** 重领域可视化不进语言核；插件槽与 scene 并排/叠层；选中互链。

```ts
interface DomainViewRegistry {
  register(view: DomainView): void;
  unregister(id: string): void;
  list(): DomainView[];
  /** 按 mediaType 找最佳插件 */
  resolve(mediaType: string): DomainView | undefined;
  open(opts: {
    viewId?: string;
    mediaType?: string;
    resource: { uri: string; mediaType: string };
    session: VivaSession;
    mount: HTMLElement;
  }): Promise<DomainViewInstance>;
}

interface DomainView {
  id: string;
  title: string;
  accept: string[];   // MIME / 自定义 mediaType
  mount(el: HTMLElement, ctx: DomainViewContext): DomainViewInstance;
}

interface DomainViewContext {
  session: VivaSession;
  host: VivaAgentHost;
  bridge: DomainBridge;
}

interface DomainBridge {
  pushToViva(path: string, value: unknown): void;
  subscribeViva(path: string, cb: (v: unknown) => void): () => void;
  /** 双向选中协议 */
  setDomainSelection(sel: DomainSelection): void;
  onDomainSelection(cb: (sel: DomainSelection) => void): () => void;
}

interface DomainSelection {
  kind: string;                 // "residue" | "gene" | "peak" | "custom"
  ids: string[];
  payload?: unknown;
}

interface DomainViewInstance {
  load(resource: { uri: string; mediaType: string }): Promise<void>;
  setSelection?(sel: DomainSelection): void;
  onSelection?(cb: (sel: DomainSelection) => void): () => void;
  dispose(): void;
}
```

### 5.1 布局（宿主职责，非核）

- `split-h`：`[ DomainView | VivaScene ]`  
- `split-v` / `tabs` / `overlay`（半透明叠在 SVG 上——慎用）  

核只保证：`bridge` 与 provenance；布局由 adapter 决定。

### 5.2 内置 vs 外置

| 插件 | 阶段 | 说明 |
| --- | --- | --- |
| `builtin.image` | F | `image/*` |
| `builtin.iframe` | F | 通用 URL 沙箱 |
| `builtin.json-table` | F 可选 | 小表预览 |
| `ext.mol*` / `ext.genome*` | 文档 + 外部包 | **永不进语言关键字** |

---

## 6. 可追溯分析接口（Provenance）— 冻结契约

**目标：** 可答辩；对标 Science history，但记录绑定 Viva 语义（源码哈希 / IR / handbook / pipeline）。

```ts
type ProvenanceKind =
  | "generate"
  | "compile"
  | "patch"
  | "run"
  | "interact"
  | "pipeline"
  | "domain"
  | "export"
  | "handbook"
  | "snapshot";

interface ProvenanceRecord {
  id: string;
  ts: number;
  kind: ProvenanceKind;
  sessionId: string;
  hostId?: string;
  sourceHash?: string;
  prevSourceHash?: string;   // patch 链
  irHash?: string;
  handbooks?: HandbookId[];
  promptDigest?: string;     // 哈希；默认不存原文
  modelId?: string;
  dataFingerprints?: Record<string, string>;
  pipelineRunId?: string;
  domainViewId?: string;
  diagnostics?: Diagnostic[];
  note?: string;
}

interface ProvenanceBundle {
  version: 1;
  exportedAt: number;
  sessionId: string;
  records: ProvenanceRecord[];
  latestSource?: string;
  latestSvg?: string;
  snapshot?: ArtifactSnapshot;
}

interface ProvenanceWriter {
  append(r: Omit<ProvenanceRecord, "id" | "ts"> & { ts?: number }): ProvenanceRecord;
  list(sessionId: string): ProvenanceRecord[];
  listAll(): ProvenanceRecord[];
  exportBundle(sessionId: string): ProvenanceBundle;
  /** 宿主可换存储 */
  clear?(sessionId?: string): void;
}

function createMemoryProvenance(): ProvenanceWriter;
```

### 6.1 靠谱性规则

1. **隐私：** 默认只存 `promptDigest`；全文需宿主显式 `note` / 自建 Writer。  
2. **交互降采样：** `drag` 过程不逐帧写；`dragend` / 每 N 秒 / `world-change` 节流合并。  
3. **链完整：** `generate → compile → patch* → pipeline* → export` 可复盘。  
4. **导出：** `exportBundle` = 答辩最小包（json + source + 可选 svg）。

---

## 7. 源码落位（实现时）

```
src/agent/
  index.ts           # createVivaAgentHost 出口
  host.ts
  session.ts         # 包 compileSource + Runtime
  prompt.ts
  events.ts
  pipeline/
    port.ts
    adapters/local-command.ts
  domain/
    registry.ts
    builtin/image.ts
    builtin/iframe.ts
  provenance/
    memory.ts
    hash.ts
```

Playground：`playground/adapter.ts` + `main.ts` 只调 Host。  
文档：`docs/hosts/minimal-host.md`（阶段 H：≤50 行可跑示例）。

---

## 8. 分阶段计划（含接口冻结点）

| 阶段 | 主题 | 交付 | 完成定义 | 门槛 |
| --- | --- | --- | --- | --- |
| **A** | 已完成 | World + Paint + layer + handbook 约定 + Arena/Atelier | 本仓库可演示 | — |
| **B** | Space | `frame` + linear `scale`；一例无魔法数散点 | 数据域坐标可运行 | H1 |
| **C** | Charts | `chart.scatter/line/bar`；误差棒可选 | 结构完整汇报图 | H2 |
| **D0** | **接口冻结 + Session MVP** | `types` 冻结；`VivaAgentHost` + `VivaSession`；playground dogfood | 无头单测 + UI 同 API | H3 H4 |
| **D1** | Handbook API | `PromptService` + 加载 `docs/handbooks/*` | 换 handbook 不改语法 | H5 |
| **D2** | Provenance MVP | Memory Writer + exportBundle + patch 链 | 生成→补丁→导出可复盘 | H6 部分 |
| **E** | Pipeline Port | Port + local-command + 回流示例 | 脚本 → setData → 图变 | 流水线 |
| **F** | Domain slots | Registry + image/iframe + bridge 互链 | 双栏选中 ↔ state | 领域视图 |
| **G** | Export | SVG 必达；PDF/mm 尝试；figure 面板 | 可带走件 | H6 |
| **H** | Host adapters | 最小宿主文档 + Cursor/Claude 适配草图 | 外部按文档接入 | 全面内联 |

推荐序：**B → C → D0（冻结接口）→ D1 → D2 → E → F → G → H**。  
并行：D0 可与 C 后半重叠；**E/F 严禁先于 D0**（避免两套挂载路径）。

### 8.1 D0「接口冻结」检查清单

- [x] `CreateSessionOptions` / `StatePolicy` / `CompileMeta` 字段定稿（改需 RFC）  
- [x] `PipelineDef` / `DomainView` / `ProvenanceRecord` 的 `kind` 联合类型定稿  
- [x] playground 删除直连 `new Runtime`  
- [x] 无头测试：`createSession({ mount: null })` + compile + snapshot  

> 实现落点：`src/agent/`、`src/space.ts`、`examples/scatter.viva`、`examples/charts.viva`、`docs/hosts/minimal-host.md`。  
> 仍欠：PDF/mm unit 导出、heat/figure widgets、外置 mol/genome 插件本体（接口已就绪）。

## 9. 每阶段验收演示（对内）

1. **B：** `xlim/ylim` 改域，点位置对，无手写 `*2.4`。  
2. **C：** 一句话生成三系列线图 + 图例。  
3. **D0：** 同一 Session，`patch` 后拖拽仍工作（按 statePolicy）。  
4. **D2：** exportBundle 含 `prevSourceHash` 链与 handbook ids。  
5. **E：** pipeline CSV → `setData` → chart 变；provenance 有 `pipeline`。  
6. **F：** 领域图点击 → `state.selectedId`；反向高亮。  
7. **H：** `docs/hosts/minimal-host.md` 示例 ≤50 行可跑。

### 9.1 「彻底超过」联合验收（1–6 齐后）

同面板连续：

1. `buildPromptBundle(["print-nature"])` → 模型出图 → `compile`。  
2. 换 handbook → `patch`，statePolicy=`preserve-data`。  
3. 拖参数 → `pipeline.run` → 图更新。  
4. 打开 `builtin.image` / 外置 mol 槽，选中桥到 Viva。  
5. `exportBundle` + `exportSvg` 交给第三方可复盘。  

缺任一步，只许说「部分超过」，不许说「彻底超过」。

---

## 10. 非目标（防范围爆炸）

- 不内置完整 HPC、不内置 BioNeMo/结构预测。  
- 不把领域视图语法写进 Viva 关键字。  
- 不在 core prompt 固化期刊风。  
- Provenance 不强制存 prompt 全文。  
- 不为每家 IDE 分叉 Runtime；只允许 Adapter 分叉。

---

## 11. 与 DESIGN 门槛映射

| DESIGN | PLAN |
| --- | --- |
| H1 Space | 阶段 B |
| H2 chart.* | 阶段 C |
| H3 内联 Runtime | 阶段 D0 `VivaSession.mount` |
| H4 热替换 | 阶段 D0 `patch` + statePolicy |
| H5 handbook API | 阶段 D1 |
| H6 导出 | 阶段 D2 bundle + G |
| 流水线 / 领域 / 可追溯 | 阶段 E / F / D2 |
| 宿主无关全面内联 | 阶段 H |

---

## 12. 近期开工切片（下一迭代）

1. **冻结：** 落地 `src/agent/types.ts`（本文 §3–§6 类型，可先无实现）。  
2. **实现 D0：** `session.ts` 包现有 `compileSource` / `Runtime`；playground 迁 Host。  
3. **并行启动 B：** `frame` 语法提案 + 最小 linear scale。  
4. **文档：** `docs/hosts/minimal-host.md` 草稿（可先伪代码）。  

**口令：** 接口先于插件；Host 先于 Pipeline/Domain；Provenance 与 Session 同生，不事后补钉。
