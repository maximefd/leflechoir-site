"""Échantillons système, leurs résumés quotidiens, et le journal des alertes (#129, #132).

- `system_sample` : un échantillon du serveur par minute (RAM, CPU, places de génération, taille de la base,
  dernière sauvegarde), gardé 30 jours ;
- `system_daily` : le résumé de chaque journée, gardé 13 mois ([ADR 0016](../../../docs/adr/0016-mesure-d-usage-sans-cookie.md), point 5) ;
- `alert_sent` : les alertes et bilans envoyés à l'auteur, qui plafonne les envois.

Trois tables nouvelles, rien de modifié : l'ancien code continue d'écrire comme avant (ADR 0010, ADR 0019).

Revision ID: 0011_systeme_et_alertes
Revises: 0010_suggestions_de_mots
Create Date: 2026-10-01
"""
import sqlalchemy as sa
from alembic import op

revision = '0011_systeme_et_alertes'
down_revision = '0010_suggestions_de_mots'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'system_sample',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('site', sa.String(length=10), nullable=False),
        sa.Column('lang', sa.String(length=5), nullable=False),
        sa.Column('mem_total_mb', sa.Integer(), nullable=True),
        sa.Column('mem_used_mb', sa.Integer(), nullable=True),
        sa.Column('api_mem_mb', sa.Integer(), nullable=True),
        sa.Column('cpu_busy', sa.BigInteger(), nullable=True),
        sa.Column('cpu_total', sa.BigInteger(), nullable=True),
        sa.Column('cpu_percent', sa.Float(), nullable=True),
        sa.Column('slots_busy', sa.Integer(), nullable=True),
        sa.Column('slots_total', sa.Integer(), nullable=True),
        sa.Column('db_size_mb', sa.Float(), nullable=True),
        sa.Column('last_backup_at', sa.DateTime(), nullable=True),
        sa.Column('api_ok', sa.Boolean(), nullable=True),
        sa.UniqueConstraint('site', 'created_at', name='uix_system_sample_site_minute'),
    )
    op.create_index('ix_system_sample_created_at', 'system_sample', ['created_at'])
    op.create_table(
        'system_daily',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('day', sa.Date(), nullable=False),
        sa.Column('site', sa.String(length=10), nullable=False),
        sa.Column('lang', sa.String(length=5), nullable=False),
        sa.Column('samples', sa.Integer(), nullable=False),
        sa.Column('mem_total_mb', sa.Integer(), nullable=True),
        sa.Column('mem_used_avg_mb', sa.Integer(), nullable=True),
        sa.Column('mem_used_max_mb', sa.Integer(), nullable=True),
        sa.Column('api_mem_max_mb', sa.Integer(), nullable=True),
        sa.Column('cpu_avg_percent', sa.Float(), nullable=True),
        sa.Column('cpu_max_percent', sa.Float(), nullable=True),
        sa.Column('slots_busy_max', sa.Integer(), nullable=True),
        sa.Column('slots_full', sa.Integer(), nullable=True),
        sa.Column('db_size_mb', sa.Float(), nullable=True),
        sa.Column('last_backup_at', sa.DateTime(), nullable=True),
        sa.Column('api_down', sa.Integer(), nullable=True),
        sa.UniqueConstraint('site', 'day', name='uix_system_daily_site_day'),
    )
    op.create_table(
        'alert_sent',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('site', sa.String(length=10), nullable=False),
        sa.Column('lang', sa.String(length=5), nullable=False),
        sa.Column('kind', sa.String(length=20), nullable=False),
        sa.Column('period', sa.String(length=20), nullable=False),
        sa.Column('summary', sa.String(length=200), nullable=False, server_default=''),
        sa.Column('delivered', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.UniqueConstraint('site', 'kind', 'period', name='uix_alert_sent_site_kind_period'),
    )
    op.create_index('ix_alert_sent_created_at', 'alert_sent', ['created_at'])


def downgrade():
    op.drop_table('alert_sent')
    op.drop_table('system_daily')
    op.drop_table('system_sample')
