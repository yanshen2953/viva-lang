# Web agent embed

Embed Viva as an interactive panel inside a chat/IDE webview (or iframe).

## JS API

```ts
import { createVivaWebEmbed } from "viva-lang/embed";

const embed = createVivaWebEmbed({
  mount: document.getElementById("panel")!,
  handbooks: ["print-nature"],
  handbookBodies: { /* optional id→markdown for browser */ },
  messageTarget: window.parent,
  targetOrigin: "*",
});

embed.post({ type: "viva:compile", source: vivaSource });
embed.post({ type: "viva:patch", source: nextSource });
embed.post({ type: "viva:exportSvg" });
```

## postMessage protocol

Parent → embed commands:

| type | payload |
| --- | --- |
| `viva:compile` | `{ source, handbooks? }` |
| `viva:patch` | `{ source, handbooks? }` |
| `viva:setData` / `viva:setState` | `{ path, value }` |
| `viva:exportSvg` | — |
| `viva:promptBundle` | `{ handbooks? }` |

Embed → parent events: `viva:ready`, `viva:compiled`, `viva:patched`, `viva:svg`, `viva:error`, `viva:event`.

## Bundles

After `npm run build`:

- `dist/embed/viva-embed.js` (ES)
- `dist/embed/viva-embed.iife.js` (script tag / `VivaEmbed`)

## Local HTTP bridge (agents without a browser SDK)

```bash
viva serve --port 8765
# POST /api/compile  { "source": "..." }
# POST /api/export   { "source": "...", "format": "pdf" }
```

See also [`bash.md`](./bash.md) and [`minimal-host.md`](./minimal-host.md).
