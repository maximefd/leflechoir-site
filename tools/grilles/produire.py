"""Produire une grille à jouer pour un jour donné (ADR 0026), à destination de la bibliothèque du site.

La grille vient de notre générateur, par l'API de développement (`make dev-api`) : géométrie sur mesure,
mots courants, mot mystère au besoin. La requête et la réponse sont gardées à côté de la grille, comme
pour les articles : elle se refait à l'identique. Les définitions, elles, s'écrivent à la main dans le
JSON (style de l'auteur, docs/STYLE-DEFINITIONS.md) — le build refuse une grille dont un mot n'a pas
la sienne.

Usage (Python 3.9 de la machine, aucun paquet à installer) :

    python -m tools.grilles.produire 2026-11-01 --size 6x9
    python -m tools.grilles.produire 2026-11-02 --size 6x10 --mystery AUTOMNE

Depuis novembre 2026, les grilles du jour se font au format du téléphone, 6 × 9 ou 6 × 10, sans force annoncée
(ADR 0026) ; `--force` ne sert plus qu'à refaire une grille d'octobre.

La seed naît de la date (la même date redonne la même première tentative) ; chaque relance en essaie
une autre : une grille sans solution, ou un mot mystère dont une lettre manque, ne coûte que du temps.
"""

import argparse
import json
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Optional

RACINE = Path(__file__).resolve().parents[2]
CONTENU = RACINE / "frontend" / "src" / "content" / "grilles"
PAGES = RACINE / "frontend" / "src" / "app" / "jouer"

# Jusqu'où chercher : la plupart des grilles sortent en un ou deux essais
ESSAIS = 15
ATTENTE_OCCUPE_S = 5  # un autre travail tient le générateur (429, Retry-After) : on laisse la place

PAGE = """import {{ PageGrille }} from "@/components/jouer/page-grille";
import {{ jouerPage }} from "@/lib/seo";
import data from "@/content/grilles/{date}.json";

// Une page par grille, sans route dynamique (export statique). Le titre et la description viennent du JSON (ils ne
// disent rien des mots) ; la grille n'est écrite dans la page qu'une fois parue (components/jouer/page-grille.tsx)
export const metadata = jouerPage(data);

export default function Page() {{
  return <PageGrille date="{date}" />;
}}
"""


def generer(api: str, corps: dict) -> tuple[int, dict]:
    """Appelle la génération : (statut, corps de la réponse)."""
    requete = urllib.request.Request(
        f"{api.rstrip('/')}/api/grids/generate",
        data=json.dumps(corps).encode("utf-8"),
        headers={"Content-Type": "application/json", "User-Agent": "produire-grilles (ADR 0026)"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(requete, timeout=300) as reponse:
            return reponse.status, json.loads(reponse.read().decode("utf-8"))
    except urllib.error.HTTPError as erreur:
        return erreur.code, json.loads(erreur.read().decode("utf-8") or "{}")


def produire(api: str, date: str, force: Optional[int], largeur: int, hauteur: int, mystere: str, souhaits: list, seed: int) -> dict:
    """Cherche une grille pour ce jour : chaque essais change de seed jusqu'à une qui sort, avec son mystère."""
    # Les mots les plus courants d'abord ; sur les grandes grilles, le tri exact les fait trop échouer
    # (mesures dans backend/benchmarks/README.md) : on descend d'un cran
    # (mesures dans backend/benchmarks/README.md) : on descend d'un cran. Compté en cases : un 6 × 10 (60 cases) garde
    # le tri exact, qui lui donne des mots courants là où le tri large sortait LEVRAUDEE ou ALESASSE (21/10/2026)
    tri = "exact" if largeur * hauteur <= 81 else "known"
    for essai in range(ESSAIS):
        corps = {
            "size": {"width": largeur, "height": hauteur},
            "seed": seed + essai,
            "quality": "best",
            "geometry": "sur_mesure",
            "frequency_mode": tri,
        }
        if mystere:
            corps["mystery_word"] = mystere
        if souhaits:
            corps["wish_words"] = souhaits
        statut, reponse = generer(api, corps)
        if statut == 429:  # le générateur est occupé : la place se libère d'elle-même
            time.sleep(ATTENTE_OCCUPE_S)
            continue
        if statut != 200:
            raise SystemExit(f"Essai {essai + 1} : l'API a répondu {statut} — {reponse.get('error', reponse)}")
        if mystere and reponse.get("mystery_error"):
            print(f"Essai {essai + 1} : {reponse['mystery_error']['error']}")
            continue
        if not reponse.get("grid", {}).get("words"):
            raise SystemExit(f"Essai {essai + 1} : réponse sans grille — {reponse}")
        grille = {"date": date, "request": corps, "response": reponse, "clues": {}}
        return {"date": date, "force": force, **grille} if force else grille
    raise SystemExit(f"Pas de grille pour {date} en {ESSAIS} essais : relance, ou change de mot mystère.")


def main() -> None:
    analyse = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    analyse.add_argument("date", help="Le jour de publication, AAAA-MM-JJ (l'adresse de la page : /jouer/<date>)")
    analyse.add_argument("--force", type=int, choices=(1, 2, 3, 4), default=None,
                         help="La force annoncée, de 1 à 4 : seulement pour refaire une grille d'octobre 2026")
    analyse.add_argument("--size", required=True, help="Le format, largeurxhauteur (ex. 9x9)")
    analyse.add_argument("--mystery", help="Un mot mystère, dont les lettres se numéroteront dans la grille")
    analyse.add_argument("--wish", default="", dest="souhaits",
                         help="Les mots souhaités du jour, séparés par des virgules : le thème de la grille")
    analyse.add_argument("--seed", type=int, default=None,
                         help="La première seed (défaut : née de la date, la même date recommence pareil)")
    analyse.add_argument("--api", default="http://localhost:5001", help="L'adresse de l'API de développement")
    analyse.add_argument("--replace", action="store_true", help="Écrase la grille du jour si elle existe déjà")
    args = analyse.parse_args()

    date = args.date
    try:
        annee, mois, jour = (int(partie) for partie in date.split("-"))
        assert len(date) == 10 and 1 <= mois <= 12 and 1 <= jour <= 31
    except (ValueError, AssertionError):
        raise SystemExit(f"Date illisible : {date} (attendu : AAAA-MM-JJ)")
    largeur_texte, _, hauteur_texte = args.size.lower().partition("x")
    try:
        largeur, hauteur = int(largeur_texte), int(hauteur_texte)
        assert 5 <= largeur <= 20 and 5 <= hauteur <= 20
    except (ValueError, AssertionError):
        raise SystemExit(f"Format illisible : {args.size} (attendu : largeurxhauteur, de 5 à 20)")

    fichier = CONTENU / f"{date}.json"
    page = PAGES / date / "page.tsx"
    if fichier.exists() and not args.replace:
        raise SystemExit(f"{fichier} existe déjà : --replace pour le refaire")

    if args.seed is None:  # la seed naît de la date, écrite en chiffres : 2026-10-07 → 20261007
        args.seed = int(date.replace("-", "")) % 1_000_000
    souhaits = [mot.strip().upper() for mot in args.souhaits.split(",") if mot.strip()]
    grille = produire(args.api, date, args.force, largeur, hauteur, args.mystery, souhaits, args.seed)

    CONTENU.mkdir(parents=True, exist_ok=True)
    fichier.write_text(json.dumps(grille, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    page.parent.mkdir(parents=True, exist_ok=True)
    page.write_text(PAGE.format(date=date), encoding="utf-8")

    mots = [mot["text"] for mot in grille["response"]["grid"]["words"]]
    mystere = grille["response"]["grid"].get("mystery")
    annonce = f"force {args.force} sur 4, " if args.force else ""
    print(f"{date} — {annonce}{largeur} × {hauteur}, {len(mots)} mots"
          + (f", mot mystère {mystere['word']} en {len(mystere['cells'])} lettres" if mystere else ""))
    print(f"Écrit : {fichier.relative_to(RACINE)}")
    print(f"Écrit : {page.relative_to(RACINE)}")
    print("Reste à faire :")
    print(f"  1. écrire les {len(mots)} définitions dans « clues » du JSON (style de l'auteur) :")
    print("     " + ", ".join(mots))
    ligne = f'{{ date: "{date}", force: {args.force} }}' if args.force else f'{{ date: "{date}" }}'
    print(f"  2. ajouter {ligne} et le chargeur dans src/content/grilles/index.ts")


if __name__ == "__main__":
    main()
