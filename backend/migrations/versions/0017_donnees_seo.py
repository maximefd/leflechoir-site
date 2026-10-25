"""Les chiffres de Google et Bing pour le poste de pilotage (ADR 0029).

Trois tables nouvelles, rien de modifié : l'ancien code continue d'écrire comme avant (ADR 0010, ADR 0019).

Revision ID: 0017_donnees_seo
Revises: 0016_force_des_articles
Create Date: 2026-10-21
"""
import sqlalchemy as sa
from alembic import op

revision = '0017_donnees_seo'
down_revision = '0016_force_des_articles'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'seo_daily',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('day', sa.Date(), nullable=False),
        sa.Column('source', sa.String(length=10), nullable=False),
        sa.Column('site', sa.String(length=10), nullable=False),
        sa.Column('lang', sa.String(length=5), nullable=False),
        sa.Column('clicks', sa.Integer(), nullable=True),
        sa.Column('impressions', sa.Integer(), nullable=True),
        sa.Column('position', sa.Float(), nullable=True),
        sa.Column('indexed', sa.Integer(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.Column('sync_error', sa.String(length=200), nullable=True),
        sa.UniqueConstraint('site', 'source', 'day', name='uq_seo_daily_site_source_day'),
    )
    op.create_table(
        'seo_query_daily',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('day', sa.Date(), nullable=False),
        sa.Column('source', sa.String(length=10), nullable=False),
        sa.Column('site', sa.String(length=10), nullable=False),
        sa.Column('lang', sa.String(length=5), nullable=False),
        sa.Column('query', sa.String(length=200), nullable=False),
        sa.Column('clicks', sa.Integer(), nullable=False),
        sa.Column('impressions', sa.Integer(), nullable=False),
        sa.Column('position', sa.Float(), nullable=True),
        sa.UniqueConstraint('site', 'source', 'day', 'query', name='uq_seo_query_daily'),
    )
    op.create_index('ix_seo_query_daily_site_day', 'seo_query_daily', ['site', 'day'])
    op.create_table(
        'seo_url_check',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('site', sa.String(length=10), nullable=False),
        sa.Column('lang', sa.String(length=5), nullable=False),
        sa.Column('url', sa.String(length=300), nullable=False),
        sa.Column('checked_at', sa.DateTime(), nullable=True),
        sa.Column('verdict', sa.String(length=20), nullable=True),
        sa.Column('coverage', sa.String(length=120), nullable=True),
        sa.UniqueConstraint('site', 'url', name='uq_seo_url_check_site_url'),
    )


def downgrade():
    op.drop_table('seo_url_check')
    op.drop_index('ix_seo_query_daily_site_day', table_name='seo_query_daily')
    op.drop_table('seo_query_daily')
    op.drop_table('seo_daily')
