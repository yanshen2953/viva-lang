# Agent HTTP API

Base URL: `viva serve` default `http://127.0.0.1:8765`

OpenAPI sketch: `GET /api/openapi.json`

## Endpoints

### `GET /api/health`

```json
{ "ok": true, "service": "viva-agent", "version": "viva-lang 0.1.0" }
```

### `GET /api/prompt`

Returns `{ "system": "..." }` — core Viva system prompt.

### `GET /api/models`

Resolved `base` / `vision` model slots from `viva.models.json` or env.

### `POST /api/compile`

```json
{
  "source": "artifact \"Hi\" ...",
  "handbookIds": ["print-nature"],
  "checkStructural": true
}
```

Response: same as `compileSource()` — `ir`, `diagnostics`, `error`.

### `POST /api/check`

```json
{
  "source": "...",
  "handbookIds": ["print-nature"],
  "visual": true,
  "vision": false,
  "width": 960
}
```

### `POST /api/export`

```json
{
  "source": "...",
  "format": "pdf",
  "handbookIds": ["print-nature"],
  "width": 1280
}
```

Returns binary body (`application/pdf`, etc.).

## Embed assets

| Path | Content |
| --- | --- |
| `/embed` | Demo page (inline plugin + buttons) |
| `/embed/viva-embed.js` | ES module SDK |
| `/embed/viva-embed.iife.js` | Script tag / `VivaEmbed` global |

## CLI equivalent

| HTTP | CLI |
| --- | --- |
| `/api/compile` | `viva compile file.viva` |
| `/api/check` | `viva check file.viva --visual` |
| `/api/export` | `viva export file.viva -f pdf` |
| `/api/prompt` | `viva prompt` |

See [`DEPLOY.md`](../DEPLOY.md) for Docker and SDK paths.
