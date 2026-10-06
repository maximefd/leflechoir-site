"""Mot mystère des grilles conservées (#218).

Une colonne ajoutée, vide par défaut : une grille sans mot mystère n'a rien à y mettre, et l'ancien code
continue d'insérer sans la connaître (ADR 0010, ADR 0019).

Revision ID: 0015_mot_mystere
Revises: 0014_messages_de_contact
Create Date: 2026-10-03
"""
import sqlalchemy as sa
from alembic import op

revision = '0015_mot_mystere'
down_revision = '0014_messages_de_contact'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('saved_grid', sa.Column('mystery', sa.JSON(none_as_null=True), nullable=True))


def downgrade():
    op.drop_column('saved_grid', 'mystery')
