#!/usr/bin/env bash
set -e

cd "$(dirname "$0")"

echo "========================================"
echo "  Flowith — Publish to GitHub"
echo "========================================"
echo ""

# 1. Check / install GitHub CLI
if ! command -v gh &>/dev/null; then
  if command -v brew &>/dev/null; then
    echo "→ Installing GitHub CLI..."
    brew install gh
  else
    echo "✗ Homebrew not found. Install it first:"
    echo "  /bin/bash -c \"\$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\""
    exit 1
  fi
fi

# 2. Login (opens browser)
echo "→ Logging into GitHub (browser will open)..."
gh auth login --hostname github.com --web

# 3. Create repo
echo "→ Creating GitHub repository..."
gh repo create Flowith \
  --description "Node-based multi-agent AI workflow manager — Tauri + React Flow + LLM" \
  --public \
  --source=. \
  --remote=origin \
  --push

echo ""
echo "========================================"
echo "  Published! 🚀"
echo "========================================"
echo ""
echo "Repo URL shown above. CI/CD will auto-build"
echo "macOS, Linux, and Windows binaries."
