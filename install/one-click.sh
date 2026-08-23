#!/usr/bin/env bash
# One-click install from git (Linux / macOS)
#   curl -fsSL https://raw.githubusercontent.com/yanshen2953/viva-lang/main/install/one-click.sh | bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
if [[ -f "$SCRIPT_DIR/install.sh" ]]; then
  exec bash "$SCRIPT_DIR/install.sh" "$@"
fi
# Remote bootstrap when piped from curl
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
REPO="${VIVA_REPO:-https://github.com/yanshen2953/viva-lang.git}"
BRANCH="${VIVA_VERSION:-main}"
git clone --depth 1 --branch "$BRANCH" "$REPO" "$TMP/viva-lang" || git clone --depth 1 "$REPO" "$TMP/viva-lang"
bash "$TMP/viva-lang/install/install.sh"
