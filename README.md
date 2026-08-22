# Viva

面向大模型的交互视觉语言：模型只写意图，编译器和运行时把一份很小的 DSL 变成可点击、可演化的 Artifact。

> 不是新的前端框架，而是一种 LLM-native Interactive Visual Language。

## 为什么

HTML / React 表达力强，但 token 贵、细节多、生成不稳定。Vega 一类可视化 DSL 擅长数据映射，却很难描述世界状态、长时间演化和对象之间的行为依赖。

Viva 的语言表面刻意很小，复杂的布局、事件、动画、场景图都留给确定性编译器。

## 快速开始

```bash
npm install
npm test
npm run dev
```

浏览器打开 [http://localhost:5173](http://localhost:5173)，左侧改 `.viva` 源码，右侧立即渲染。

### 安装 CLI（Win / Mac / Linux）

```bash
# npm
npm install -g .
# 或
bash install/install.sh          # Linux/macOS
# Windows: powershell -File install\install.ps1
```

```bash
viva version
viva export examples/charts.viva -f pdf -o charts.pdf   # 矢量 PDF（几何 1:1）
viva export examples/hello.viva -f pdf-raster -o r.pdf # 栅格 PDF 回退
viva serve --port 8765           # agent HTTP 内嵌桥
```

网页 Agent 内嵌：`import { createVivaWebEmbed } from "viva-lang/embed"` — 见 [`docs/hosts/web-embed.md`](docs/hosts/web-embed.md)。  
Bash 接口：[`docs/hosts/bash.md`](docs/hosts/bash.md)。  
**审查圈选 → agent 修图**：Playground「审查模式」或 [`docs/hosts/review.md`](docs/hosts/review.md)。

## 最小例子

```viva
artifact "Hello Viva"

state count = 0

scene
  size: 880 480
  background: #0b1220
  layer main
    node counter
      x: 440
      y: 240
      text: count
      font: 72
      fill: #f8fafc
      align: center

event click on counter
  count = count + 1
```

## 设计原则

- **小语言，大运行时**：只描述世界是什么、状态如何变。
- **视觉完备 + 交互完备**：Scene、State、Event、Rule、Bind、Tick、Animate。
- **LLM 友好**：默认值强、语义优先、少参数、错误可定位。

完整设计见 [LLM_Native_Interactive_Artifact_Language_Design.md](./LLM_Native_Interactive_Artifact_Language_Design.md)，语法速查见 [docs/LANGUAGE.md](./docs/LANGUAGE.md)。

给模型用的 System Prompt 在 `src/llm/system-prompt.ts`。

## 仓库结构

```
src/          词法、语法、IR、编译器、运行时、agent、review、export
examples/     可运行的 .viva 示例
playground/   本地交互演练场（含审查模式）
docs/         语言、架构、Host 集成（hosts/）、测试说明
tests/        确定性 corpus + agent-exam
scripts/      CLI 演示与 UI 检查脚本
install/      Win/Mac/Linux 安装脚本
```

### Host 集成文档

| 文档 | 用途 |
| --- | --- |
| [`docs/hosts/minimal-host.md`](docs/hosts/minimal-host.md) | Session / Host 最小接入 |
| [`docs/hosts/web-embed.md`](docs/hosts/web-embed.md) | iframe / postMessage |
| [`docs/hosts/bash.md`](docs/hosts/bash.md) | `viva` CLI |
| [`docs/hosts/review.md`](docs/hosts/review.md) | 圈选标注 → `agentBrief` |

## 许可

MIT
