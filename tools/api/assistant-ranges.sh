#!/bin/sh
# Les adresses d'où les assistants appellent les connecteurs MCP (revue de sécurité de l'API ouverte, ADR 0032) :
# un appel relayé n'a les quotas de son assistant que s'il vient de l'une d'elles. Anthropic publie une plage fixe ;
# OpenAI, une liste mise à jour « au mieux », à relever de temps en temps (make assistant-ranges, puis une PR).
#   https://platform.claude.com/docs/en/api/ip-addresses        (sortantes : 160.79.104.0/21)
#   https://openai.com/chatgpt-connectors.json                   (apps, connecteurs et actions de ChatGPT)
set -eu
cd "$(dirname "$0")/../.."
OUT=backend/assistant_ranges.json
tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT
curl -fsS --max-time 30 https://openai.com/chatgpt-connectors.json -o "$tmp"
python3 -I - "$tmp" "$OUT" <<'PY'
import ipaddress, json, sys
from datetime import date
source, target = sys.argv[1], sys.argv[2]
openai = json.load(open(source))
chatgpt = sorted({str(ipaddress.ip_network(entry.get("ipv4Prefix") or entry["ipv6Prefix"], strict=False))
                  for entry in openai["prefixes"]})
if len(chatgpt) < 20:
    sys.exit(f"liste de ChatGPT suspecte : {len(chatgpt)} plages seulement")
data = {
    "note": "Adresses des assistants qui appellent le connecteur MCP ; tools/api/assistant-ranges.sh les relève.",
    "updated": date.today().isoformat(),
    "assistants": {
        "claude": {"source": "https://platform.claude.com/docs/en/api/ip-addresses", "ranges": ["160.79.104.0/21"]},
        "chatgpt": {"source": "https://openai.com/chatgpt-connectors.json", "created": openai.get("creationTime"),
                    "ranges": chatgpt},
    },
}
with open(target, "w") as f:
    json.dump(data, f, indent=1)
    f.write("\n")
print(f"{target} : Claude 1 plage, ChatGPT {len(chatgpt)} plages")
PY
