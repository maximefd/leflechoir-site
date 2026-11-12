#!/bin/sh
# Le paquet du connecteur pour l'annuaire de ChatGPT (« plugin » d'OpenAI ; docs/ANNUAIRES.md) : manifeste, adresse du
# connecteur et logo, dans un ZIP à déposer sur platform.openai.com/plugins.
#   sh tools/api/paquet-chatgpt.sh      → dist/le-flechoir-chatgpt.zip
set -eu
cd "$(dirname "$0")/../.."
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
mkdir -p "$work/le-flechoir/assets" dist
cp mcp/annuaires/chatgpt/plugin.json mcp/annuaires/chatgpt/mcp.json "$work/le-flechoir/"
# Le logo du site (carré, 180 px)
cp frontend/src/app/apple-icon.png "$work/le-flechoir/assets/logo.png"
python3 -c "import json,sys; [json.load(open(f)) for f in sys.argv[1:]]" "$work/le-flechoir/plugin.json" "$work/le-flechoir/mcp.json"
rm -f dist/le-flechoir-chatgpt.zip
(cd "$work" && zip -qr - le-flechoir) > dist/le-flechoir-chatgpt.zip
echo "dist/le-flechoir-chatgpt.zip"
