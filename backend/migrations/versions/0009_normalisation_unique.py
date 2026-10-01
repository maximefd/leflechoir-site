"""Une seule normalisation des mots (#127) : les mots des dictionnaires personnels existants.

`PersonalWord.mot` gardait tirets, apostrophes, espaces et ligatures (« PORTE-MONNAIE », « CŒUR ») : il n'était
pas comparable aux mots du lexique ni aux motifs de recherche. Il prend la forme commune (normalization.py).
Deux mots d'un même dictionnaire qui deviennent identiques sont fusionnés : on garde le plus ancien, et une
définition s'il n'en avait pas. `mot_affiche` ne change pas.

Revision ID: 0009_normalisation_unique
Revises: 0008_role_administrateur
Create Date: 2026-09-27
"""
import sqlalchemy as sa
from alembic import op

from normalization import normalize_word

revision = '0009_normalisation_unique'
down_revision = '0008_role_administrateur'
branch_labels = None
depends_on = None


def upgrade():
    normalize_personal_words(op.get_bind())


def normalize_personal_words(connection):
    """Séparé de `upgrade` pour être testé sur une base de test (test_normalization.py)."""
    rows = connection.execute(sa.text(
        "SELECT id, dictionary_id, mot, definition FROM personal_word ORDER BY dictionary_id, date_ajout, id"
    )).fetchall()
    kept = {}  # (dictionnaire, mot normalisé) -> (id, définition)
    for row in rows:
        normalized = normalize_word(row.mot)
        key = (row.dictionary_id, normalized)
        if key in kept:
            first_id, first_definition = kept[key]
            if not first_definition and row.definition:
                connection.execute(sa.text("UPDATE personal_word SET definition = :d WHERE id = :i"),
                                   {"d": row.definition, "i": first_id})
                kept[key] = (first_id, row.definition)
            connection.execute(sa.text("DELETE FROM personal_word WHERE id = :i"), {"i": row.id})
        else:
            kept[key] = (row.id, row.definition)
            if normalized != row.mot:
                connection.execute(sa.text("UPDATE personal_word SET mot = :m WHERE id = :i"),
                                   {"m": normalized, "i": row.id})


def downgrade():
    # La forme d'origine n'est pas gardée : mot_affiche en reste la trace lisible
    pass
