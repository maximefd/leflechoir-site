"""Les grilles du jour réussies, gardées avec le compte.

Une table nouvelle, rien de modifié : l'ancien code continue d'écrire comme avant (ADR 0010, ADR 0019).

Revision ID: 0018_reussites
Revises: 0017_donnees_seo
Create Date: 2026-10-26
"""
import sqlalchemy as sa
from alembic import op

revision = '0018_reussites'
down_revision = '0017_donnees_seo'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'grid_success',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('user.id', ondelete='CASCADE'), nullable=False),
        sa.Column('lang', sa.String(length=5), nullable=False),
        sa.Column('grid_date', sa.Date(), nullable=False),
        sa.Column('best_ms', sa.Integer(), nullable=True),
        sa.Column('first_day', sa.Date(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.UniqueConstraint('user_id', 'lang', 'grid_date', name='uq_grid_success_user_lang_date'),
    )
    op.create_index('ix_grid_success_user_id', 'grid_success', ['user_id'])


def downgrade():
    op.drop_table('grid_success')
