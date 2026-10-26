#!/bin/sh
# Livrer une PR validée par l'auteur, de bout en bout ([ADR 0019](../../docs/adr/0019-deploiement.md)) : passer sa CI
# (sur le Mac, ADR 0030, si elle n'y est pas déjà passée) et attendre qu'elle finisse, s'arrêter si un contrôle échoue, la fusionner (merge commit), déployer le `main` qui en sort et
# vérifier le site et l'API de l'extérieur. Pensé pour tourner sans surveillance : l'auteur dit « validé », la
# commande fait le reste et résume ce qu'elle a fait.
#
# Usage : tools/deploy/livrer.sh PR [CIBLE]      (ou : make livrer PR=244 CIBLE=api)
#   CIBLE : all (défaut : l'API puis le site), api, front, ou rien (fusionner sans déployer : outillage, docs)
#
# Le déploiement part d'une copie propre de `origin/main` (git worktree temporaire) : jamais du dossier de travail,
# où l'auteur a peut-être des modifications en cours ou un serveur de développement qui tourne. La configuration
# (.env, avec DEPLOY_HOST) est celle du dépôt principal, lue sur place par deploy.sh.
set -eu

PR="${1:?Usage : livrer.sh PR [all|api|front|rien]}"
CIBLE="${2:-all}"
case "$CIBLE" in all|api|front|rien) ;; *) echo "CIBLE inconnue : $CIBLE (all, api, front ou rien)" >&2; exit 2 ;; esac

say() { printf '%s\n' "$*"; }
die() { printf 'ERREUR : %s\n' "$*" >&2; exit 1; }
command -v gh >/dev/null || die "gh introuvable"

# Le dépôt principal (là où vit .env), d'où que la commande soit lancée, worktree compris
REPO="$(cd "$(git rev-parse --git-common-dir)/.." && pwd)"
[ -f "$REPO/.env" ] || [ "$CIBLE" = rien ] || die "$REPO/.env absent : la configuration du déploiement y vit"

state="$(gh pr view "$PR" --json state -q .state)"
[ "$state" = OPEN ] || die "la PR $PR n'est pas ouverte ($state)"
title="$(gh pr view "$PR" --json title -q .title)"
say "PR $PR — $title"

# 1. La CI. Elle tourne sur le Mac (ADR 0030) : si le commit de la PR n'a pas encore son contrôle « ci-locale » vert,
# on la lance ici (tools/ci/verifier.sh), puis on attend la fin de tous les contrôles ; un contrôle rouge arrête
# tout, et dit lequel
tete="$(gh pr view "$PR" --json headRefOid -q .headRefOid)"
depot="$(gh repo view --json nameWithOwner -q .nameWithOwner)"
locale="$(gh api "repos/$depot/commits/$tete/status" -q '[.statuses[] | select(.context == "ci-locale")][0].state // ""')"
if [ "$locale" != success ]; then
    say "CI locale : pas encore verte sur ce commit, je la lance."
    "$(dirname "$0")/../ci/verifier.sh" "$PR" || die "CI locale en échec : rien n'est fusionné ni déployé"
fi
say "CI : en attente de la fin des contrôles…"
# Les contrôles d'un commit tout juste poussé mettent un moment à apparaître : « aucun contrôle » n'est pas un échec
tries=0
until [ -n "$(gh pr checks "$PR" 2>/dev/null)" ]; do
    tries=$((tries + 1))
    [ "$tries" -le 60 ] || die "aucun contrôle n'est apparu en 10 minutes : la CI ne s'est pas lancée ?"
    sleep 10
done
while :; do
    gh pr checks "$PR" --watch --interval 30 >/dev/null 2>&1 || true
    states="$(gh pr checks "$PR" 2>/dev/null | awk -F'\t' '{print $2}')"
    if printf '%s\n' "$states" | grep -qE '^(fail|cancel)'; then
        say "CI : échec."
        gh pr checks "$PR" 2>/dev/null | awk -F'\t' '$2 ~ /^(fail|cancel)/ {print "  " $1 " : " $2}'
        die "rien n'est fusionné ni déployé"
    fi
    printf '%s\n' "$states" | grep -qE '^(pending|queued|in_progress|waiting)' || break
    sleep 30
done
say "CI : verte."

# 2. La fusion (merge commit, CONTRIBUTING.md)
gh pr merge "$PR" --merge >/dev/null
say "Fusionnée dans main."
[ "$CIBLE" = rien ] && { say "Rien à déployer (CIBLE=rien)."; exit 0; }

# 3. Le déploiement, depuis une copie propre de origin/main
git -C "$REPO" fetch -q origin main
work="$(mktemp -d)"
trap 'git -C "$REPO" worktree remove --force "$work" >/dev/null 2>&1 || true; rm -rf "$work"' EXIT
git -C "$REPO" worktree add -q --detach "$work" origin/main
ln -s "$REPO/.env" "$work/.env"
case "$CIBLE" in
    all) target=deploy ;;
    api) target=deploy-api ;;
    front) target=deploy-front ;;
esac
say "Déploiement ($target) de $(git -C "$work" log -1 --format='%h — %s')…"
log="$work/.livraison.log"
if ! make -C "$work" "$target" >"$log" 2>&1; then
    tail -n 30 "$log" >&2
    die "le déploiement a échoué (journal ci-dessus) ; deploy.sh revient de lui-même à la version précédente de l'API"
fi
grep -E "^Version|en service|en ligne|IndexNow|Dépôt public" "$log" | sed 's/^/  /'

# 4. La vérification, de l'extérieur
site="${DEPLOY_SITE_URL:-https://leflechoir.fr}"
api="$(grep -E '^DEPLOY_API_URL=' "$REPO/.env" 2>/dev/null | tail -n 1 | cut -d= -f2-)"
api="${api:-https://api.leflechoir.fr}"
code_site="$(curl -s -o /dev/null -w '%{http_code}' "$site/")"
code_api="$(curl -s -o /dev/null -w '%{http_code}' "$api/api/status")"
say "Vérification : site $code_site, API $code_api."
[ "$code_site" = 200 ] && [ "$code_api" = 200 ] || die "le site ou l'API ne répond pas comme attendu"
say "Livrée."
