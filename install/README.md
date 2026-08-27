# Install & packages (Win / Mac / Linux)

Viva ships as an **npm package** with a `viva` binary, browser embed bundles, and optional Docker.

## Quick install

### npm (recommended)

```bash
npm install -g viva-lang
# from a release folder:
npm install -g ./release/viva-lang-0.2.0.tgz
viva version
```

### One-click (Linux / macOS)

```bash
bash install/one-click.sh
# or
bash install/install.sh
export PATH="$HOME/.local/bin:$PATH"
```

### Windows

```powershell
powershell -ExecutionPolicy Bypass -File install\install.ps1
```

### Docker (server / team)

```bash
docker compose up -d --build
curl http://localhost:8765/api/health
```

## Build full release bundle

```bash
npm run pack:release
```

Produces `release/`:

| File | Role |
| --- | --- |
| `viva-lang-*.tgz` | npm install package (dist + CLI + docs) |
| `install.sh` / `install.ps1` / `one-click.sh` | OS installers |
| `Dockerfile` + `docker-compose.yml` | Container deploy |
| `DEPLOY.md` | Agent integration guide |

## After install

| Surface | Command / API |
| --- | --- |
| CLI | `viva compile\|check\|export\|serve` |
| HTTP REST | `viva serve` → `/api/compile`, `/api/check`, `/api/export` |
| Node SDK | `import from "viva-lang/agent"` |
| Browser | `import from "viva-lang/embed"` |

Full deployment: [`docs/DEPLOY.md`](../docs/DEPLOY.md).
