"""L'API ouverte : les clés, les générations qui attendent leur tour, les processus de génération (ADR 0032).

Trois tables nouvelles, rien de modifié : l'ancien code continue d'écrire comme avant (ADR 0010, ADR 0019). Elles
forment l'espace « api », commun à tous les sites : créées ici dans la base du site, c'est celle qui sert tant que
`API_DATABASE_URL` ne désigne pas une autre base. Les clés n'ont pas de clé étrangère vers `user` : leur compte peut
être celui d'un autre site, dans une autre base.

Revision ID: 0019_api_ouverte
Revises: 0018_reussites
Create Date: 2026-10-27
"""
import sqlalchemy as sa
from alembic import op

revision = '0019_api_ouverte'
down_revision = '0018_reussites'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'api_key',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('owner_site', sa.String(length=10), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=60), nullable=False),
        sa.Column('prefix', sa.String(length=16), nullable=False),
        sa.Column('key_hash', sa.String(length=64), nullable=False, unique=True),
        sa.Column('plan', sa.String(length=10), nullable=False, server_default='free'),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('last_used_at', sa.DateTime(), nullable=True),
        sa.Column('revoked_at', sa.DateTime(), nullable=True),
    )
    op.create_index('ix_api_key_owner', 'api_key', ['owner_site', 'user_id'])
    op.create_table(
        'generation_job',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('public_id', sa.String(length=32), nullable=False, unique=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('started_at', sa.DateTime(), nullable=True),
        sa.Column('finished_at', sa.DateTime(), nullable=True),
        sa.Column('expires_at', sa.DateTime(), nullable=False),
        sa.Column('status', sa.String(length=10), nullable=False),
        sa.Column('priority', sa.SmallInteger(), nullable=False),
        sa.Column('client', sa.String(length=10), nullable=False),
        sa.Column('api_key_id', sa.Integer(), sa.ForeignKey('api_key.id', ondelete='CASCADE'), nullable=True),
        sa.Column('visitor', sa.String(length=32), nullable=True),
        sa.Column('lang', sa.String(length=5), nullable=False),
        sa.Column('site', sa.String(length=10), nullable=False),
        sa.Column('idempotency_key', sa.String(length=80), nullable=True),
        sa.Column('settings_hash', sa.String(length=64), nullable=False),
        sa.Column('request', sa.JSON(), nullable=False),
        sa.Column('result', sa.JSON(), nullable=True),
        sa.Column('reason', sa.String(length=40), nullable=True),
        sa.Column('word_count', sa.Integer(), nullable=False),
        sa.Column('duration_ms', sa.Integer(), nullable=True),
    )
    op.create_index('ix_generation_job_queue', 'generation_job', ['status', 'lang', 'priority', 'id'])
    op.create_index('ix_generation_job_key_date', 'generation_job', ['api_key_id', 'created_at'])
    op.create_index('ix_generation_job_visitor_date', 'generation_job', ['visitor', 'created_at'])
    op.create_index('ix_generation_job_date', 'generation_job', ['created_at'])
    op.create_index('ix_generation_job_expires', 'generation_job', ['expires_at'])
    op.create_table(
        'api_runner',
        sa.Column('lang', sa.String(length=5), primary_key=True),
        sa.Column('site', sa.String(length=10), nullable=False),
        sa.Column('site_url', sa.String(length=200), nullable=False),
        sa.Column('beat_at', sa.DateTime(), nullable=False),
        sa.Column('paused_until', sa.DateTime(), nullable=True),
    )


def downgrade():
    op.drop_table('api_runner')
    op.drop_table('generation_job')
    op.drop_table('api_key')
