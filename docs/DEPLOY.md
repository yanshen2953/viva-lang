# 部署与 Agent 接入

Viva 作为 **npm 安装包** 发布：CLI、MCP、HTTP REST、Node SDK、浏览器 embed，任意 Agent 任选一种接入。

## 一键部署（三选一）

### A. npm 全局安装（推荐）

```bash
npm install -g ./release/viva-lang-*.tgz
# 或发布后: npm install -g viva-lang

viva version
viva serve --host 0.0.0.0 --port 8765
```

### B. 脚本一键安装（Linux / macOS）

```bash
bash install/install.sh
# 远程:
# curl -fsSL https://raw.githubusercontent.com/yanshen2953/viva-lang/main/install/one-click.sh | bash
```

Windows: `powershell -ExecutionPolicy Bypass -File install\install.ps1`

### C. Docker Compose（服务器 / 内网）

```bash
docker compose up -d --build
curl http://localhost:8765/api/health
```

构建发布包：

```bash
npm run pack:release
# → release/viva-lang-*.tgz + install.sh + Dockerfile + DEPLOY.md
```

---

## MCP（Cursor / Claude Desktop）

IDE 内 Agent 推荐 MCP，无需自己起 HTTP：

```bash
viva mcp
```

Cursor 配置示例（`mcp-config.example.json`）：

```json
{
  "mcpServers": {
    "viva": {
      "command": "viva",
      "args": ["mcp"]
    }
  }
}
```

工具：`viva_compile`、`viva_check`、`viva_export`、`viva_prompt`、`viva_models`、`viva_session`、`viva_pipeline`。

详见 [`hosts/mcp.md`](hosts/mcp.md)。

---

| 方式 | 适合 | 文档 |
| --- | --- | --- |
| **HTTP REST** | 任意语言 Agent、远程服务、无 SDK | 本文 § HTTP API |
| **CLI** | Shell / Pi / Cursor 子进程 | [`hosts/bash.md`](hosts/bash.md) |
| **Node SDK** | 同进程 Host、Pipeline、审查 | [`hosts/minimal-host.md`](hosts/minimal-host.md) |
| **Browser embed** | 聊天气泡内联、iframe | [`hosts/web-embed.md`](hosts/web-embed.md) + [`inline-embed.md`](hosts/inline-embed.md) |

### 推荐组合

1. **远程 Agent** → `viva serve` 或 Docker，只调 HTTP。
2. **IDE 内嵌 Webview** → `createVivaInlineEmbed` + `postMessage`。
3. **深度集成** → `createVivaAgentHost` + Session `compile/patch/check`。

---

## HTTP API（`viva serve`）

启动后默认 `http://127.0.0.1:8765`（Docker 映射同端口）。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/health` | 存活检查 |
| GET | `/api/version` | 版本字符串 |
| GET | `/api/openapi.json` | OpenAPI 3.1 概要 |
| GET | `/api/models` | 解析后的 base/vision 模型槽 |
| GET | `/api/prompt` | 核心 system prompt |
| POST | `/api/compile` | 编译 → IR JSON |
| POST | `/api/check` | 结构 / 像素 / 多模态检查 |
| POST | `/api/export` | 导出 svg/png/jpg/pdf |
| POST | `/api/session` | 无头 Session；`/:id/compile\|patch\|world\|bundle` |
| POST | `/api/pipeline/run` | 对 Session 跑 `inline.set` 或已注册 webhook |
| GET | `/embed` | 演示页（内联插件 + API 按钮） |
| GET | `/embed/viva-embed.js` | ES 模块 embed 包 |

### 编译

```bash
curl -s http://localhost:8765/api/compile \
  -H 'content-type: application/json' \
  -d '{"source":"artifact \"Hi\"\nscene\n  layer a\n    node t\n      x:10\n      y:10\n      text: \"ok\"","handbookIds":["print-nature"],"checkStructural":true}'
```

### 检查

```bash
curl -s http://localhost:8765/api/check \
  -H 'content-type: application/json' \
  -d '{"source":"...","handbookIds":["print-nature"],"visual":true}'
```

### 导出 PDF

```bash
curl -s http://localhost:8765/api/export \
  -H 'content-type: application/json' \
  -d '{"source":"...","format":"pdf","handbookIds":["print-nature"]}' \
  -o out.pdf
```

### 环境变量（多模态检查）

复制 `viva.models.json.example` → `viva.models.json`，或设置 `VIVA_MODELS_CONFIG`。Docker Compose 已挂载示例配置。

---

## npm 包导出路径

| 导入 | 用途 |
| --- | --- |
| `viva-lang` | 编译、Runtime、检查、导出 |
| `viva-lang/agent` | Host、Session、HTTP server、`createVivaAgentHost` |
| `viva-lang/embed` | `createVivaWebEmbed`、`createVivaInlineEmbed` |
| `viva-lang/export` | 仅导出管线 |
| `viva-lang/review` | 圈选审查 → agentBrief |

安装后全局命令：`viva` → `dist/cli.js`。

---

## 接入其它 Agent 的最小流程

1. 部署：`docker compose up` 或 `npm i -g viva-lang && viva serve`。
2. 给 coding Agent 工具定义：HTTP POST `/api/compile` + `/api/check` + `/api/export`。
3. System prompt：`GET /api/prompt` + 可选 handbook（CLI: `viva prompt --handbook print-nature`）。
4. 聊天气泡 UI：父页面加载 `/embed/viva-embed.js`，`createVivaInlineEmbed`（默认 `print-nature` + 可交互）。

无需改 Viva 源码；换 Agent 只需换调用方配置。

---

## 生产注意

- Node **≥ 18**（CI / Docker 用 22）；导出 PDF/PNG 依赖原生模块 `@resvg/resvg-js`、`sharp`（已打进 npm 包）。
- 镜像和仓库 `assets/` 带 Liberation Sans + 整字 CJK。`viva check --visual` 需要 `poppler-utils`；beat gif/mp4 需要 `ffmpeg`（Docker 已装）。
- `viva serve --host 0.0.0.0` 无内置鉴权，请用反向代理或内网。
- 密钥走环境变量，勿提交 `viva.models.json`。

更细 Host 文档：[`hosts/README.md`](hosts/README.md)。
