#!/usr/bin/env bash
# Build production dist + npm tarball + release folder (installers, docker, docs).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
mkdir -p release

echo "==> Full library + playground + embed"
npm run build

echo "==> npm pack"
npm pack --pack-destination release
mkdir -p packages
rm -f packages/viva-lang-*.tgz
cp -f release/viva-lang-*.tgz packages/
python3 - <<'PY'
from hashlib import sha256
from pathlib import Path
root = Path("packages")
lines = []
for p in sorted(root.glob("viva-lang-*.tgz")):
    digest = sha256(p.read_bytes()).hexdigest()
    lines.append(f"{digest}  packages/{p.name}\n")
text = "".join(lines)
(root / "SHA256SUMS").write_text(text, encoding="utf8")
print(text, end="")
PY

cp -f install/install.sh install/install.ps1 install/one-click.sh release/
cp -f Dockerfile docker-compose.yml release/
cp -f docs/hosts/mcp-config.example.json release/
cp -f viva.models.json.example viva.models.schema.json release/
cp -f docs/DEPLOY.md release/DEPLOY.md

cat > release/README.md <<'EOF'
# Viva-lang release bundle

## 1) npm (all platforms, Node ≥ 18)

```bash
npm install -g ./viva-lang-*.tgz
viva version
viva serve --host 0.0.0.0 --port 8765
```

## 2) One-click shell install

```bash
bash install.sh
# or from internet:
# curl -fsSL .../install/one-click.sh | bash
```

## 3) Docker one-command deploy

```bash
docker compose up -d --build
curl http://localhost:8765/api/health
```

## Agent surfaces

| Surface | Entry |
| --- | --- |
| CLI | `viva compile\|check\|export\|provenance\|serve` |
| MCP stdio | `viva mcp` (`viva_session` / `viva_pipeline` too) |
| HTTP REST | `POST /api/compile`, `/api/check`, `/api/export`, `/api/session`, `/api/pipeline/run` |
| Browser SDK | `import from "viva-lang/embed"` |
| Node SDK | `import from "viva-lang/agent"` |
| Node HTTP | `import from "viva-lang/agent/node"` |

Full guide: `DEPLOY.md` (also in repo `docs/DEPLOY.md`).
EOF

echo "==> release/"
ls -la release/
