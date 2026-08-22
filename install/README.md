# Install & packages (Win / Mac / Linux)

Viva ships as an **npm package** with a `viva` binary. Native installers wrap npm for each OS.

## Quick install

### npm (recommended, all platforms)

```bash
npm install -g viva-lang
# from a release tarball:
npm install -g ./release/viva-lang-0.1.0.tgz
viva version
```

### Linux / macOS

```bash
bash install/install.sh
export PATH="$HOME/.local/bin:$PATH"
viva version
```

### Windows

```powershell
powershell -ExecutionPolicy Bypass -File install\install.ps1
# ensure %LOCALAPPDATA%\viva-lang\bin is on PATH
viva version
```

## Build a release folder

```bash
npm run pack:release
# → release/viva-lang-*.tgz
# → release/install.sh
# → release/install.ps1
# → release/README.md
```

## What you get

| Artifact | Role |
| --- | --- |
| `viva` CLI | bash agent surface + export |
| `viva-lang` / `viva-lang/embed` | library + web embed |
| `viva-lang/export` | SVG/PNG/JPG/PDF |
| `dist/embed/*.js` | browser bundles |

Docs: [`docs/hosts/bash.md`](../docs/hosts/bash.md), [`docs/hosts/web-embed.md`](../docs/hosts/web-embed.md).
