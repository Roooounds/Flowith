#!/usr/bin/env bash
set -e

cd "$(dirname "$0")"

echo "========================================"
echo "  Flowith v1.0.0 Release Builder"
echo "========================================"
echo ""

# Check pnpm
if ! command -v pnpm &>/dev/null; then
  echo "→ Installing pnpm..."
  npm install -g pnpm
fi

# Check Rust
if ! command -v rustc &>/dev/null; then
  echo "→ Installing Rust..."
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
  source "$HOME/.cargo/env"
fi

echo "→ Installing dependencies..."
pnpm install

echo "→ Building macOS app (this may take 5-10 min)..."
pnpm tauri build

echo ""
echo "========================================"
echo "  Build complete!"
echo "  App: src-tauri/target/release/bundle/"
echo "========================================"
