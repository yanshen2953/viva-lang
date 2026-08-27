#!/usr/bin/env bash
# Install Viva CLI on Linux / macOS (bash/zsh).
set -euo pipefail

PREFIX="${VIVA_PREFIX:-$HOME/.local}"
BIN_DIR="$PREFIX/bin"
SHARE_DIR="$PREFIX/share/viva-lang"
REPO_URL="${VIVA_REPO:-https://github.com/yanshen2953/viva-lang.git}"
VERSION="${VIVA_VERSION:-main}"

mkdir -p "$BIN_DIR" "$SHARE_DIR"

echo "Installing viva-lang → $SHARE_DIR"

if command -v npm >/dev/null 2>&1; then
  TMP="$(mktemp -d)"
  cleanup() { rm -rf "$TMP"; }
  trap cleanup EXIT

  if [[ -f "./package.json" ]] && grep -q '"name": "viva-lang"' ./package.json 2>/dev/null; then
    echo "Using local checkout…"
    npm install --omit=dev
    npm run build
    # link globally into user prefix
    npm install -g --prefix "$PREFIX" .
  else
    echo "Fetching $REPO_URL ($VERSION)…"
    git clone --depth 1 --branch "$VERSION" "$REPO_URL" "$TMP/viva-lang" || \
      git clone --depth 1 "$REPO_URL" "$TMP/viva-lang"
    cd "$TMP/viva-lang"
    npm install --omit=dev
    npm run build
    npm install -g --prefix "$PREFIX" .
  fi
else
  echo "npm is required (Node.js >= 18)." >&2
  exit 1
fi

# Ensure PATH hint
if ! command -v viva >/dev/null 2>&1; then
  echo ""
  echo "Add to your shell rc:"
  echo "  export PATH=\"$BIN_DIR:\$PATH\""
fi

if ! command -v pdftoppm >/dev/null 2>&1 || ! command -v pdftotext >/dev/null 2>&1; then
  echo "Note: viva check --visual uses poppler-utils (pdftoppm / pdftotext)." >&2
fi
if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "Note: beat gif/mp4 export uses ffmpeg; tests skip that path without it." >&2
fi

echo ""
echo "Done. Try:"
echo "  viva version"
echo "  viva export examples/hello.viva -f pdf -o hello.pdf"
echo "  viva serve --port 8765"
