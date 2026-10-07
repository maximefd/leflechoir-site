"""Force des grilles d'articles, notée par les lecteurs.

Une table nouvelle, rien de modifié : l'ancien code continue d'écrire comme avant (ADR 0010, ADR 0019).

Revision ID: 0016_force_des_articles
Revises: 0015_mot_mystere
Create Date: 2026-10-06
"""
import sqlalchemy as sa
from alembic import op

revision = '0016_force_des_articles'
down_revision = '0015_mot_mystere'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'article_rating',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('slug', sa.String(length=80), nullable=False),
        sa.Column('lang', sa.String(length=5), nullable=False),
        sa.Column('force', sa.SmallInteger(), nullable=False),
        sa.Column('visitor', sa.String(length=32), nullable=True),
    )
    op.create_index('ix_article_rating_created_at', 'article_rating', ['created_at'])
    op.create_index('ix_article_rating_slug_lang', 'article_rating', ['slug', 'lang'])


def downgrade():
    op.drop_table('article_rating')
