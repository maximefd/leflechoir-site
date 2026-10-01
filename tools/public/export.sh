#!/bin/sh
# Publie la partie open source de Le Fléchoir (site et API Flask) dans le dépôt public (ADR 0021).
#
# Le dépôt de travail est privé : il contient le moteur de génération et le lexique curé. Ce script
# exporte le commit en cours SANS historique, retire tout ce que liste tools/public/prive.txt, et pousse
# le résultat comme un seul commit dans le dépôt public. Rien d'autre ne le traverse : ni l'historique,
# ni les branches, ni les fichiers non suivis.
set -eu

PUBLIC_REPO="${PUBLIC_REPO:-https://github.com/maximefd/leflechoir-site.git}"
ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"
COMMIT="$(git rev-parse --short=12 HEAD)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# 1. Le commit en cours, tel que suivi par git
mkdir "$WORK/export"
git archive HEAD | tar -x -C "$WORK/export"

# 2. Retirer le privé, puis vérifier qu'il n'en reste rien
grep -v '^#' tools/public/prive.txt | grep -v '^[[:space:]]*$' | while read -r path; do
  rm -rf "${WORK:?}/export/$path"
done
grep -v '^#' tools/public/prive.txt | grep -v '^[[:space:]]*$' | while read -r path; do
  if [ -e "$WORK/export/$path" ]; then echo "Export : $path est encore présent, abandon." >&2; exit 1; fi
done

# 3. L'avertissement du dépôt public, en tête du README
{
  cat tools/public/LISEZMOI-PUBLIC.md
  echo
  cat "$WORK/export/README.md"
} > "$WORK/README.md" && mv "$WORK/README.md" "$WORK/export/README.md"

# 4. Remplacer le contenu du dépôt public par l'export, en un commit
git clone --quiet --depth 1 "$PUBLIC_REPO" "$WORK/public" 2>/dev/null || {
  mkdir "$WORK/public" && git -C "$WORK/public" init --quiet -b main
  git -C "$WORK/public" remote add origin "$PUBLIC_REPO"
}
find "$WORK/public" -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} +
cp -R "$WORK/export/." "$WORK/public/"
cd "$WORK/public"
git add -A
if git diff --cached --quiet; then
  echo "Dépôt public : déjà à jour."
  exit 0
fi
git -c user.name="Le Fléchoir" -c user.email="contact@leflechoir.fr" commit --quiet -m "Synchronisation du site ($COMMIT)"
git push --quiet origin HEAD:main
echo "Dépôt public : synchronisé ($COMMIT)."
