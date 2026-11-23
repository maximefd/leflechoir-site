#!/bin/sh
# Sur le serveur, en LECTURE SEULE : ce que la séance de maintenance doit savoir (ADR 0035, docs/MAINTENANCE.md).
# Envoyé sur l'entrée standard par `tools/deploy/deploy.sh maintenance` (make maintenance-serveur) : il n'a pas à
# être déployé, et c'est la seule commande serveur que la séance planifiée a le droit de lancer. Rien ici n'écrit :
# toute commande ajoutée doit rester une lecture. Sortie courte : elle est lue par Claude à chaque séance.
set -u

PROJET="${PROJET:-leflechoir}"
BASE="${LEFLECHOIR_BASE:-/opt/$PROJET}"
ENV_FILE="$BASE/.env.production"
current="$(basename "$(readlink "$BASE/current")" 2>/dev/null || true)"

titre() { printf '\n== %s\n' "$*"; }
flask() {
    RELEASE="$current" docker compose -p "$PROJET" -f "$BASE/releases/$current/docker-compose.prod.yml" \
        --env-file "$ENV_FILE" exec -T -e LEXICON_LOAD=0 api flask "$@" 2>&1 \
        | grep -v -e '^{"time"' -e '^INFO  \[alembic'
}

titre "Version"
printf 'En service : %s\n' "${current:-aucune}"
[ -f "$BASE/backups/derniere-sauvegarde" ] && printf 'Dernière sauvegarde sur R2 : %s\n' "$(cat "$BASE/backups/derniere-sauvegarde")"

titre "Machine"
uptime
free -m | sed -n 1,2p
df -h / | tail -n 1
docker ps --format '{{.Names}} {{.Status}}' --filter "name=$PROJET"

titre "Minuteur, 7 jours (échecs)"
echecs="$(journalctl -t leflechoir-minuteur --since '7 days ago' -p warning --no-pager -q 2>/dev/null || true)"
if [ -n "$echecs" ]; then printf '%s\n' "$echecs" | tail -n 5; else echo "aucun"; fi

[ -n "$current" ] || { echo "Aucune version en service : rien d'autre à lire."; exit 0; }

titre "Usage"
flask stats

titre "SEO"
# Les totaux seulement, sans les séries par jour
flask seo status | python3 -c '
import json, sys
data = json.load(sys.stdin)
for moteur, valeurs in data.items():
    if isinstance(valeurs, dict):
        print(moteur, {k: v for k, v in valeurs.items() if not isinstance(v, (list, dict))})
' 2>&1 || echo "illisible"

titre "Administrateurs"
flask admin list

titre "Clés de l'API (20 premières)"
flask api keys | head -n 20
