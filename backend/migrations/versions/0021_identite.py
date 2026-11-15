"""Les connexions avec un compte Google ou Microsoft (ADR 0034).

Additive (ADR 0019) : une table nouvelle, rien de modifié. L'ancien code l'ignore ; un compte créé par un fournisseur
garde un mot de passe inutilisable dans `user.password` (NOT NULL inchangé), que l'ancien code refuse comme un mauvais
mot de passe.

Revision ID: 0021_identite
Revises: 0020_conformite_api
Create Date: 2026-11-14
"""
import sqlalchemy as sa
from alembic import op

revision = '0021_identite'
down_revision = '0020_conformite_api'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'identite',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('user.id', ondelete='CASCADE'), nullable=False),
        sa.Column('provider', sa.String(length=20), nullable=False),
        sa.Column('subject', sa.String(length=255), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('last_used_at', sa.DateTime(), nullable=True),
        sa.UniqueConstraint('provider', 'subject', name='uq_identite_provider_subject'),
    )
    op.create_index('ix_identite_user_id', 'identite', ['user_id'])


def downgrade():
    op.drop_index('ix_identite_user_id', table_name='identite')
    op.drop_table('identite')
