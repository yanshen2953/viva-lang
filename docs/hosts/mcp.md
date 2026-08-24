# MCP server (Cursor / Claude Desktop)

For **IDE-native agents**, MCP is the most convenient surface: the host spawns `viva mcp` over **stdio** and exposes tools without custom HTTP wiring.

HTTP (`viva serve`) and MCP solve the same problems; pick one per host:

| Surface | Best for |
| --- | --- |
| **MCP** | Cursor, Claude Desktop, Pi (via `install/pi-viva-mcp.ts` extension) |
| **HTTP** | Remote services, polyglot clients, Docker |
| **CLI** | Shell scripts, Pi subprocess without tools |
| **SDK** | Same-process Node integration |

## Tools

| Tool | Purpose |
| --- | --- |
| `viva_compile` | Source → IR JSON；默认附 structural + raster visual QA（`visual:false` 可关）。visual 错误会失败 compile success，IR 仍返回以便 repair |
| `viva_check` | Structural / raster visual（默认开）/ `--vision` QA |
| `viva_export` | svg/png/jpg/pdf (base64 or `outputPath`)；`cjkFontPath` 挂宿主 TTF 做 PDF CJK（也认 `VIVA_PDF_CJK_FONT`）；`beats:true` 出 `__beat` PNG 序列；`format` gif\|mp4 用 ffmpeg 拼幻灯（不是时间轴） |
| `viva_prompt` | System prompt + handbooks |
| `viva_models` | Resolved base/vision model slots |
| `viva_session` | Headless session: `create` / `compile` / `patch` / `world` / `set` / `simulate` / `provenance` / `bundle` / `dispose` |
| `viva_pipeline` | `run` / `list` / `register` (`inline` or `http-webhook`) / `cancel` |

**Prompt:** `viva_generate` — template for “write a new artifact” turns.

## Cursor configuration

After `npm install -g viva-lang` (or local `npm link`):

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

Example file: [`mcp-config.example.json`](./mcp-config.example.json)

From a git checkout without global install:

```json
{
  "mcpServers": {
    "viva": {
      "command": "npx",
      "args": ["vite-node", "src/cli.ts", "mcp"],
      "cwd": "/path/to/viva-lang"
    }
  }
}
```

## Run manually

```bash
viva mcp
# or
viva-mcp
```

Logs must go to **stderr** (stdio is the protocol channel).

## Test with MCP Inspector

```bash
npx @modelcontextprotocol/inspector viva mcp
```

## Node API

```ts
import { runVivaMcpServer } from "viva-lang/mcp";
await runVivaMcpServer();
```

## Pi (no built-in MCP)

Pi 0.73 does **not** speak MCP. Load the repo extension; it spawns `viva mcp` over stdio with the official SDK and forwards the same tools:

```bash
export PATH="$HOME/.npm-global/bin:$PATH"
pi --no-extensions -e install/pi-viva-mcp.ts --no-builtin-tools \
  --tools viva_compile,viva_check,viva_session,viva_prompt \
  -p "Write a Viva scatter and compile it."
```

`npm run test:agent-exam` uses this path (not `--no-tools`). Agent exam still grades with `VivaAgentHost`; MCP is how Pi compiles/checks while generating.

`compile` / `check` JSON includes `hints` when `ir.data` is empty (entities must be data-backed).

See also [`DEPLOY.md`](../DEPLOY.md), [`agent-api.md`](./agent-api.md).
