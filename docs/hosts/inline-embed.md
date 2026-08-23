# Inline embed plugin (default chat card)

Codex / Claude Science–style **inline figures** are mostly: tight card chrome + publication palette + **interactive** when needed. Viva does the same with a **builtin domain plugin** instead of a static PNG.

## Two surfaces (same defaults)

| API | Use when |
| --- | --- |
| `createVivaInlineEmbed` | Chat webview / iframe parent owns the panel |
| `builtin.viva-inline` domain view | Pipeline opens `application/vnd.viva` artifacts |

Both default to:

- Handbook **`print-nature`** (light, Wong palette)
- **`preserve-data`** session policy
- Card CSS: white background, soft border, rounded corners, max-height scroll

## Chat embed

```ts
import { createVivaInlineEmbed } from "viva-lang/embed";

const embed = createVivaInlineEmbed({
  mount: document.getElementById("bubble")!,
  maxHeight: 420,
  handbookBodies: { "print-nature": markdown },
});

embed.post({ type: "viva:patch", source: vivaSource });
```

Full `postMessage` protocol: [`web-embed.md`](./web-embed.md).

## Domain plugin (pipeline)

Register is automatic on `createVivaAgentHost()`.

```ts
const host = createVivaAgentHost();
await host.domains.open({
  session,
  mount: panelEl,
  resource: {
    uri: "data:text/x-viva;base64,…",
    mediaType: "application/vnd.viva",
  },
});
```

Plugin id: `builtin.viva-inline` (`VIVA_INLINE_PLUGIN_ID`).

Accepted media: `application/vnd.viva`, `text/x-viva`, `viva/source`, `viva/*`.

## Why this beats PNG-only inline

- Same **look** as export (handbook at compile time)
- **Click / drag / tick** still work in the bubble
- Checks (`structural` / `visual` / `vision`) run on the same IR path as Playground
- The card paints a **read-only** strip for compile errors and structural notes. It does not run visual/raster in the browser, and it does not auto-repair.

Style remains a **plugin** (`print-nature` today; swap handbook per host).

See also: [`minimal-host.md`](./minimal-host.md), [`docs/handbooks/README.md`](../../handbooks/README.md).
