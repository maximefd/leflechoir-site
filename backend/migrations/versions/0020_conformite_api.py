"""Avant l'ouverture de l'API : les comptes des jours clos, les mots absents, l'acceptation des conditions.

Suite de l'avis juridique du 08/11/2026. Additive (ADR 0019) : deux tables et deux colonnes nouvelles, rien de
modifié ; l'ancien code ignore les tables, et une clé créée par lui n'a simplement pas d'acceptation enregistrée.
- `day_visitors` : les visiteurs d'un jour clos, comptés, avant que l'empreinte du jour soit effacée des événements ;
- `missing_word` : les mots demandés absents du lexique, sans rien qui relie à qui les a demandés ;
- `api_key.terms_version`, `api_key.terms_accepted_at` : les conditions acceptées à la création d'une clé ;
- `contact_message.details` : ce que porte un signalement de contenu (adresse, nom, bonne foi ; DSA, art. 16).

Revision ID: 0020_conformite_api
Revises: 0019_api_ouverte
Create Date: 2026-11-08
"""
import sqlalchemy as sa
from alembic import op

revision = '0020_conformite_api'
down_revision = '0019_api_ouverte'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'day_visitors',
        sa.Column('day', sa.Date(), primary_key=True),
        sa.Column('site', sa.String(length=10), primary_key=True),
        sa.Column('key', sa.String(length=120), primary_key=True),
        sa.Column('visitors', sa.Integer(), nullable=False),
    )
    op.create_table(
        'missing_word',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('day', sa.Date(), nullable=False),
        sa.Column('site', sa.String(length=10), nullable=False),
        sa.Column('lang', sa.String(length=5), nullable=False),
        sa.Column('word', sa.String(length=40), nullable=False),
        sa.Column('display', sa.String(length=40), nullable=False),
        sa.Column('source', sa.String(length=10), nullable=False),
    )
    op.create_index('ix_missing_word_day', 'missing_word', ['day'])
    op.add_column('api_key', sa.Column('terms_version', sa.String(length=20), nullable=True))
    op.add_column('api_key', sa.Column('terms_accepted_at', sa.DateTime(), nullable=True))
    op.add_column('contact_message', sa.Column('details', sa.JSON(), nullable=True))


def downgrade():
    op.drop_column('contact_message', 'details')
    op.drop_column('api_key', 'terms_accepted_at')
    op.drop_column('api_key', 'terms_version')
    op.drop_index('ix_missing_word_day', table_name='missing_word')
    op.drop_table('missing_word')
    op.drop_table('day_visitors')
