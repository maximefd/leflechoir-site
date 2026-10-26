#!/bin/sh
# La CI sur le Mac (ADR 0030) : les mêmes contrôles que la CI de GitHub, sans une minute d'Actions. Le résultat est
# affiché sur la PR comme un contrôle (« ci-locale », statut du commit), que `make livrer` attend comme le reste.
#
# Usage : tools/ci/verifier.sh [PR|REF]      (ou : make verifier PR=250, make verifier REF=ma-branche)
#   Sans argument : la branche en cours (HEAD). Le commit vérifié est celui de la PR, fusionné avec origin/main :
#   ce qui sera livré, comme le testait GitHub.
#   TOUT=1 : tous les contrôles, même ceux que la PR ne touche pas.
#
# Tout se passe dans une copie propre (git worktree temporaire) et une pile Docker jetable (réseau, PostgreSQL,
# Mailpit, API) sur des ports à part (API 5090, site 3090, Mailpit 8090) : jamais dans le dossier de travail, ni sur
# les serveurs de développement de l'auteur (:3000, :5001). Rien n'est publié si un contrôle échoue, sauf l'échec.
set -eu

say() { printf '%s\n' "$*"; }
die() { printf 'ERREUR : %s\n' "$*" >&2; exit 1; }
for outil in gh docker pnpm git; do command -v "$outil" >/dev/null || die "$outil introuvable"; done

REPO="$(cd "$(git rev-parse --git-common-dir)/.." && pwd)"
CIBLE="${1:-HEAD}"
git -C "$REPO" fetch -q origin
case "$CIBLE" in
    *[!0-9]*) SHA="$(git -C "$REPO" rev-parse --verify "$CIBLE^{commit}")" ;;
    *) git -C "$REPO" fetch -q origin "pull/$CIBLE/head" && SHA="$(git -C "$REPO" rev-parse FETCH_HEAD)" ;;
esac
DEPOT="$(gh repo view --json nameWithOwner -q .nameWithOwner)"
COURT="$(printf %s "$SHA" | cut -c1-8)"

API_PORT=5090; SITE_PORT=3090; MAIL_PORT=8090
for port in $API_PORT $SITE_PORT $MAIL_PORT; do
    ! lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1 || die "le port $port est pris : une autre vérification tourne ?"
done

JOURNAL="$REPO/.ci-locale/$COURT.log"
mkdir -p "$REPO/.ci-locale"
: > "$JOURNAL"
WORK="$(mktemp -d)/verifier"
PILE="ci_locale_$$"
SITE_PID=""
ETAPE="préparation"
DEBUT="$(date +%s)"

statut() {  # état, description : le contrôle « ci-locale » sur le commit, visible sur la PR
    gh api -X POST "repos/$DEPOT/statuses/$SHA" -f state="$1" -f context=ci-locale -f description="$2" >/dev/null \
        || say "(statut non publié sur GitHub : $1)"
}

nettoyer() {
    code=$?
    [ -z "$SITE_PID" ] || kill "$SITE_PID" 2>/dev/null || true
    docker rm -f "${PILE}_api" "${PILE}_db" "${PILE}_mail" >/dev/null 2>&1 || true
    docker network rm "$PILE" >/dev/null 2>&1 || true
    git -C "$REPO" worktree remove --force "$WORK" 2>/dev/null || true
    if [ "$code" -ne 0 ]; then
        statut failure "Échec : $ETAPE (journal : .ci-locale/$COURT.log)"
        say "ÉCHEC à l'étape « $ETAPE ». Journal : $JOURNAL"
    fi
}
trap nettoyer EXIT
trap 'exit 130' INT TERM

etape() { ETAPE="$1"; say "→ $1"; printf '\n===== %s =====\n' "$1" >> "$JOURNAL"; }
# Une commande, sa sortie au journal ; en cas d'échec, la fin du journal à l'écran
lancer() { "$@" >> "$JOURNAL" 2>&1 || { tail -40 "$JOURNAL" >&2; return 1; }; }

say "Vérification de $COURT ($CIBLE) — journal : $JOURNAL"
statut pending "En cours sur le Mac de l'auteur"

etape "copie propre, fusionnée avec origin/main"
lancer git -C "$REPO" worktree add -q --detach "$WORK" "$SHA"
git -C "$WORK" -c user.name=ci-locale -c user.email=ci@localhost merge -q --no-edit origin/main >> "$JOURNAL" 2>&1 \
    || { ETAPE="fusion avec main (conflit)"; exit 1; }

# Le tri, comme le job « tri » de GitHub : ce que la PR touche par rapport à main
git -C "$WORK" diff --name-only origin/main...HEAD > "$WORK/.fichiers" 2>/dev/null || true
touche() { [ "${TOUT:-0}" = 1 ] || grep -qE "$1" "$WORK/.fichiers"; }
BACKEND=0; SITE=0
touche '^(backend/|tools/|data/|\.github/|frontend/src/content/|frontend/tests/fixtures/)' && BACKEND=1
touche '^(frontend/|backend/|\.github/)' && SITE=1
say "  à vérifier : tests Python $( [ $BACKEND = 1 ] && echo oui || echo non ), site et parcours $( [ $SITE = 1 ] && echo oui || echo non )"

etape "secrets (gitleaks)"
lancer docker run --rm -v "$WORK":/repo --entrypoint sh ghcr.io/gitleaks/gitleaks:v8.30.1 -c \
    "git config --global --add safe.directory '*' && gitleaks git /repo --no-banner --redact --config /repo/.gitleaks.toml --log-opts='origin/main..HEAD'"

# Le Python de la CI (3.11), dans Docker ; le cache de pip est gardé d'une fois sur l'autre
PIP_CACHE="ci-locale-pip"
if [ $BACKEND = 1 ]; then
    etape "tests Python (ruff, pip-audit, pytest avec couverture, layouts, outils)"
    lancer docker run --rm --memory=2g -v "$WORK":/repo -v "$PIP_CACHE":/root/.cache/pip -w /repo \
        -e PYTHONDONTWRITEBYTECODE=1 python:3.11-slim sh -ec "
            pip install -q -r backend/requirements.txt ruff==0.16.7 pytest-cov==7.1.0 pytest-xdist==3.8.0 pip-audit
            ruff check backend tools
            pip-audit -r backend/requirements.txt -r tools/curator/requirements.txt
            pytest -q -p no:cacheprovider -n 2 backend/tests/ --cov=backend/engine --cov-report=term --cov-fail-under=80
            python backend/check_layouts.py
            pytest -q -p no:cacheprovider tools/ --cov=tools --cov-report=term --cov-fail-under=70"
fi

if [ $SITE = 1 ]; then
    etape "site (pnpm audit, lint, types, export statique)"
    cd "$WORK/frontend"
    lancer pnpm install --frozen-lockfile
    lancer pnpm audit --prod
    lancer pnpm lint
    lancer pnpm exec tsc --noEmit
    lancer env NEXT_PUBLIC_API_BASE_URL="http://localhost:$API_PORT" pnpm build

    etape "pile jetable (PostgreSQL, Mailpit, API)"
    lancer docker network create "$PILE"
    lancer docker run -d --name "${PILE}_db" --network "$PILE" --network-alias db \
        -e POSTGRES_USER=terminator -e POSTGRES_PASSWORD=terminator -e POSTGRES_DB=terminator_test postgres:15-alpine
    lancer docker run -d --name "${PILE}_mail" --network "$PILE" --network-alias mail -p "$MAIL_PORT:8025" axllent/mailpit:v1.31.2
    lancer docker run -d --name "${PILE}_api" --network "$PILE" --memory=1500m -p "$API_PORT:5001" \
        -v "$WORK/backend":/app -v "$PIP_CACHE":/root/.cache/pip -w /app -e PYTHONDONTWRITEBYTECODE=1 \
        -e PORT=5001 -e DATABASE_URL=postgresql://terminator:terminator@db:5432/terminator_test \
        -e SECRET_KEY=ci-secret-key-long-enough-for-tests-only -e JWT_SECRET_KEY=ci-jwt-secret-key-long-enough-for-tests-only \
        -e RATELIMIT_REGISTER="1000 per hour" -e LEXICON_RELOAD_INTERVAL_S=0 \
        -e MAIL_BACKEND=smtp -e SMTP_HOST=mail -e SMTP_PORT=1025 \
        -e FRONTEND_URL="http://localhost:$SITE_PORT" -e CORS_ORIGINS="http://localhost:$SITE_PORT" \
        python:3.11-slim sh -c "pip install -q -r requirements.txt && until python -c 'import socket; socket.create_connection((\"db\", 5432))' 2>/dev/null; do sleep 1; done && python run.py"
    tries=0
    until curl -sf "http://localhost:$API_PORT/api/status" >/dev/null; do
        tries=$((tries + 1))
        [ "$tries" -le 150 ] || { docker logs "${PILE}_api" >> "$JOURNAL" 2>&1; die "l'API n'a pas démarré en 5 minutes"; }
        sleep 2
    done

    etape "parcours de bout en bout et accessibilité, sur l'export"
    pnpm serve:static --port "$SITE_PORT" >> "$JOURNAL" 2>&1 &
    SITE_PID=$!
    tries=0
    until curl -sf -o /dev/null "http://localhost:$SITE_PORT/"; do
        tries=$((tries + 1)); [ "$tries" -le 90 ] || die "le site exporté n'a pas démarré"
        sleep 2
    done
    # Sans webServer (sous Node 26, il bloque la fin de la suite) ni captures du README ; Chrome du Mac
    cat > playwright.verifier.config.ts <<'EOF'
import base from "./playwright.config";
export default { ...base, webServer: undefined, retries: 1, testIgnore: ["**/screenshots.spec.ts"] };
EOF
    lancer env PLAYWRIGHT_STATIC=1 PLAYWRIGHT_BASE_URL="http://localhost:$SITE_PORT" \
        PLAYWRIGHT_API_URL="http://localhost:$API_PORT" MAILPIT_URL="http://localhost:$MAIL_PORT" \
        NEXT_PUBLIC_API_BASE_URL="http://localhost:$API_PORT" \
        ./node_modules/.bin/playwright test -c playwright.verifier.config.ts --reporter=line --workers=3 \
        --global-timeout=1500000 --output="$REPO/.ci-locale/resultats-$COURT"
    cd "$REPO"
fi

DUREE=$(( ($(date +%s) - DEBUT) / 60 ))
FAIT="secrets"; [ $BACKEND = 1 ] && FAIT="$FAIT, tests Python"; [ $SITE = 1 ] && FAIT="$FAIT, site et parcours"
statut success "OK en $DUREE min : $FAIT"
say "Vérifié : $FAIT, en $DUREE min. Le contrôle « ci-locale » est vert sur $COURT."
