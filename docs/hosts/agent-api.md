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
  "checkStructural": true,
  "visual": true
}
```

Response: `compileSource()` fields plus raster `visual` / `visualOk`. Visual findings do not fail IR success. `visual: false` skips the raster.

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
  "width": 1280,
  "cjkFontPath": "/path/to/NotoSansCJK-Regular.ttf"
}
```

Returns binary body (`application/pdf`, etc.).

`beats: true` returns JSON with one PNG at each `layout.board` Clock hold midpoint. With `format: "gif"` or `"mp4"` and a timeline, export samples the complete hold+ease cycle at `timeline.fps` and encodes those playback frames with ffmpeg. It shares Runtime Clock semantics, but it is not a desktop NLE with audio/editing tracks.

### Session / Pipeline / Provenance

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/session` | Create headless session (`handbooks`, `statePolicy`) |
| GET | `/api/session` | List sessions |
| POST | `/api/session/:id/compile` | Compile source (records provenance) |
| POST | `/api/session/:id/patch` | Patch with session `statePolicy` |
| GET | `/api/session/:id/world` | Read `state` / `data` |
| POST | `/api/session/:id/data` | `{ path, value }` → `setData` |
| POST | `/api/session/:id/simulate` | Headless ticks/events |
| GET | `/api/session/:id/bundle` | Provenance export bundle |
| GET | `/api/pipeline` | Registered pipelines (`inline.set` builtin) |
| POST | `/api/pipeline/run` | `{ id, sessionId, values }` |
| POST | `/api/pipeline/register` | `{ id, title, kind, url }` webhook or inline |

CLI: `viva provenance file.viva` compiles via a temporary session and prints the bundle.

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
