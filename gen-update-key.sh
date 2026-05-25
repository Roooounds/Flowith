#!/usr/bin/env bash
set -e

cd "$(dirname "$0")"

echo "========================================"
echo "  Flowith — Update Signing Key Generator"
echo "========================================"
echo ""

KEY_FILE="$HOME/.flowith/update.key"

mkdir -p "$HOME/.flowith"

echo "→ Generating ed25519 signing key..."
cargo tauri signer generate -w "$KEY_FILE" -p ""

echo ""
echo "========================================"
echo "  Key generated at: $KEY_FILE"
echo "========================================"
echo ""

# Extract public key
PUBKEY=$(cargo tauri signer sign -k "$KEY_FILE" -p "" --print-pubkey 2>/dev/null || echo "")

if [ -n "$PUBKEY" ]; then
  echo "── Public key (paste into src-tauri/tauri.conf.json → plugins.updater.pubkey):"
  echo ""
  echo "  $PUBKEY"
  echo ""
fi

echo "── Then add these to GitHub:"
echo "  1. Go to https://github.com/Roooounds/Flowith/settings/secrets/actions"
echo "  2. Add secret TAURI_SIGNING_PRIVATE_KEY"
echo "     Value: (content of $KEY_FILE)"
echo "  3. Add secret TAURI_SIGNING_PRIVATE_KEY_PASSWORD"
echo "     Value: (leave empty — no password set)"
echo ""
echo "  To copy the private key:"
echo "    cat $KEY_FILE | pbcopy"
echo ""
