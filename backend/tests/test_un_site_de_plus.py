"""Un site de plus, sans réécrire le code (ADR 0017, ADR 0033).

Ce qui distingue un site est rangé à un seul endroit par couche : `frontend/src/config/site.ts` (nom, adresse,
langue, contacts), `deploy/sites/<site>.env` (déploiement), la configuration de l'API (`SITE`, `SITE_LANG`,
`SITE_NAME`). Ces tests gardent la règle : le nom public du site n'est écrit en dur nulle part ailleurs dans le
code du site, et chaque profil de déploiement est complet.
"""

import re
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
FRONTEND = ROOT / "frontend" / "src"
SITES = ROOT / "deploy" / "sites"
PROFILE_KEYS = {"SITE", "SITE_LANG", "NEXT_PUBLIC_SITE", "PROJET", "DEPLOY_SITE_URL", "DEPLOY_API_URL",
                "PAGES_PROJECT", "LEXIQUE_DIR"}
# Des textes rédigés pour le site français (articles, guide) : ils seront traduits, pas recopiés
CONTENU_REDIGE = ("content/articles/", "content/grilles/")


def _code_lines(path: Path):
    """Les lignes de code, sans les commentaires (`//`, `/* … */`, `{/* … */}`, `*` de JSDoc)."""
    text = path.read_text(encoding="utf-8")
    text = re.sub(r"/\*.*?\*/", "", text, flags=re.S)
    for number, line in enumerate(text.splitlines(), 1):
        stripped = line.strip()
        if stripped.startswith("//") or stripped.startswith("*"):
            continue
        yield number, line


@pytest.mark.skipif(not FRONTEND.is_dir(), reason="frontend/ absent (make test-backend ne monte que backend/)")
def test_the_site_name_is_written_nowhere_but_in_the_site_configuration():
    found = []
    for path in sorted(FRONTEND.rglob("*.ts*")):
        relative = path.relative_to(FRONTEND).as_posix()
        if relative == "config/site.ts" or relative.startswith(CONTENU_REDIGE):
            continue
        found += [f"{relative}:{number}" for number, line in _code_lines(path) if "Fléchoir" in line]
    assert found == []


@pytest.mark.skipif(not SITES.is_dir(), reason="deploy/ absent (make test-backend ne monte que backend/)")
@pytest.mark.parametrize("profile", sorted(SITES.glob("*.env")) if SITES.is_dir() else [], ids=lambda p: p.stem)
def test_every_site_profile_is_complete(profile):
    values = dict(line.split("=", 1) for line in profile.read_text(encoding="utf-8").splitlines()
                  if line and not line.startswith("#"))
    assert PROFILE_KEYS <= set(values)
    assert values["SITE"] == profile.stem == values["NEXT_PUBLIC_SITE"]
    assert values["DEPLOY_SITE_URL"].startswith("https://") and values["DEPLOY_API_URL"].startswith("https://")
    # Pas de secret dans un profil versionné
    assert not any(re.search(r"(KEY|TOKEN|PASSWORD|SECRET|DSN)", key) for key in values)
