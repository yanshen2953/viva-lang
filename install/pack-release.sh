#!/usr/bin/env bash
# Build npm tarball + copy platform installers into release/
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
mkdir -p release
npm pack --pack-destination release
cp -f install/install.sh install/install.ps1 release/
cat > release/README.md <<'EOF'
# Viva-lang release packages

## npm (all platforms with Node ≥ 18)

```bash
npm install -g ./viva-lang-*.tgz
# or from registry once published:
# npm install -g viva-lang
viva version
```

## Linux / macOS installer

```bash
bash install.sh
# or from a git checkout:
bash install/install.sh
```

## Windows installer

```powershell
.\install.ps1
```

## Agent surfaces after install

| Surface | Command / API |
| --- | --- |
| Bash | `viva compile\|export\|serve\|prompt` |
| Web embed | `import { createVivaWebEmbed } from "viva-lang/embed"` |
| HTTP bridge | `viva serve --port 8765` |
| Export | `viva export file.viva -f pdf\|jpg\|png\|svg` |
EOF
echo "Wrote release/ :"
ls -la release/
