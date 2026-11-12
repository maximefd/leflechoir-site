#!/bin/sh
# Publier le connecteur dans le registre MCP (registry.modelcontextprotocol.io ; ADR 0032, lot 4). L'espace de noms
# fr.leflechoir/* se prouve par le DNS de leflechoir.fr : une clé Ed25519, dont la moitié publique va dans un TXT.
#
#   sh tools/api/registre-mcp.sh cle        # crée la clé (hors du dépôt) et affiche le TXT à poser chez Cloudflare
#   sh tools/api/registre-mcp.sh publier    # une fois le TXT visible : connexion, puis publication de mcp/server.json
#
# Il faut OpenSSL 3 (celui de Homebrew : celui de macOS ne sait pas faire d'Ed25519) et mcp-publisher
# (brew install mcp-publisher). La clé privée reste dans ~/.config/leflechoir, jamais dans le dépôt.
set -eu
cd "$(dirname "$0")/../.."
DOMAIN=leflechoir.fr
KEY="${MCP_REGISTRY_KEY:-$HOME/.config/leflechoir/registre-mcp.pem}"
OPENSSL="$(brew --prefix openssl@3 2>/dev/null)/bin/openssl"
[ -x "$OPENSSL" ] || OPENSSL=openssl

case "${1:-}" in
    cle)
        if [ ! -f "$KEY" ]; then
            mkdir -p "$(dirname "$KEY")" && umask 077
            "$OPENSSL" genpkey -algorithm Ed25519 -out "$KEY"
        fi
        public="$("$OPENSSL" pkey -in "$KEY" -pubout -outform DER | tail -c 32 | base64)"
        echo "Dans Cloudflare → leflechoir.fr → DNS → Records → Add record :"
        echo "  Type TXT, Name @ (leflechoir.fr), Content :"
        echo "  v=MCPv1; k=ed25519; p=$public"
        ;;
    publier)
        command -v mcp-publisher >/dev/null || { echo "mcp-publisher introuvable : brew install mcp-publisher" >&2; exit 1; }
        dig TXT "$DOMAIN" +short | grep -q "v=MCPv1" || { echo "Le TXT v=MCPv1 n'est pas encore visible sur $DOMAIN" >&2; exit 1; }
        private="$("$OPENSSL" pkey -in "$KEY" -noout -text | grep -A3 "priv:" | tail -n +2 | tr -d ' :\n')"
        mcp-publisher login dns --domain "$DOMAIN" --private-key "$private"
        (cd mcp && mcp-publisher validate && mcp-publisher publish)
        ;;
    *)
        echo "Usage : $0 cle | publier" >&2
        exit 2
        ;;
esac
