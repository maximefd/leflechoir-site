#!/bin/sh
# Le minuteur du poste de pilotage, sur le serveur (ADR 0022, #129, #132) : chaque minute, un échantillon du
# serveur, le ménage du jour, les alertes et, le lundi, le bilan de la semaine. Lancé par cron (docs/PRODUCTION.md).
#
# Usage : tools/monitor/tick.sh
#
# Tout se passe dans `flask system tick`, lancé dans le conteneur de l'API : il y voit les places de génération,
# la base et la configuration des e-mails. Ce script ne fait que trois choses :
#   - ne rien lancer si un passage précédent tourne encore ;
#   - lire sur l'hôte la trace de la dernière sauvegarde (tools/db/backup-offsite.sh), que le conteneur ne voit pas ;
#   - se taire quand tout va bien, pour ne pas écrire 1 440 lignes par jour dans le journal.
#
# Si le conteneur de l'API est arrêté, rien n'est échantillonné et aucune alerte ne part d'ici : c'est la
# surveillance externe (UptimeRobot) qui prévient.
set -eu

BASE="${LEFLECHOIR_BASE:-/opt/leflechoir}"
ENV_FILE="${ENV_FILE:-$BASE/.env.production}"
API_CONTAINER="${API_CONTAINER:-leflechoir-api-1}"
MARKER="$BASE/backups/derniere-sauvegarde"

# Un seul passage à la fois : si le précédent attend encore (envoi d'e-mail, base lente), celui-ci s'efface
exec 9>"${TMPDIR:-/tmp}/leflechoir-minuteur.lock"
flock -n 9 || exit 0

[ -n "$(docker ps -q --filter "name=^${API_CONTAINER}\$" --filter status=running)" ] || exit 0

# Vide si la trace manque : `flask system tick` sait alors qu'aucune sauvegarde n'a été copiée, et alerte
trace="$(head -n 1 "$MARKER" 2>/dev/null || true)"

if ! output="$(docker compose -p leflechoir -f "$BASE/current/docker-compose.prod.yml" --env-file "$ENV_FILE" \
        exec -T -e LEXICON_LOAD=0 api flask system tick --last-backup "$trace" 2>&1)"; then
    printf '%s\n' "$output" >&2
    exit 1
fi
