# MCP server (Cursor / Claude Desktop)

For **IDE-native agents**, MCP is the most convenient surface: the host spawns `viva mcp` over **stdio** and exposes tools without custom HTTP wiring.

HTTP (`viva serve`) and MCP solve the same problems; pick one per host:

| Surface | Best for |
| --- | --- |
| **MCP** | Cursor, Claude Desktop, MCP-aware CLI agents |
| **HTTP** | Remote services, polyglot clients, Docker |
| **CLI** | Shell scripts, Pi subprocess |
| **SDK** | Same-process Node integration |

## Tools

| Tool | Purpose |
| --- | --- |
| `viva_compile` | Source → IR JSON (+ optional structural check) |
| `viva_check` | Structural / `--visual` / `--vision` QA |
| `viva_export` | svg/png/jpg/pdf (base64 or `outputPath`) |
| `viva_prompt` | System prompt + handbooks |
| `viva_models` | Resolved base/vision model slots |

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

See also [`DEPLOY.md`](../DEPLOY.md), [`agent-api.md`](./agent-api.md).
