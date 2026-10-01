"""Mises en page proposées au catalogue (roadmap 5C).

Revision ID: 0013_mises_en_page_proposees
Revises: 0011_systeme_et_alertes
Create Date: 2026-10-01
"""
import sqlalchemy as sa
from alembic import op

revision = '0013_mises_en_page_proposees'
down_revision = '0011_systeme_et_alertes'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'layout_proposal',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('width', sa.Integer(), nullable=False),
        sa.Column('height', sa.Integer(), nullable=False),
        sa.Column('rows', sa.Text(), nullable=False),
        sa.Column('lang', sa.String(length=5), nullable=False),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('user.id', ondelete='CASCADE'), nullable=False),
        sa.UniqueConstraint('lang', 'rows', name='uq_layout_proposal_lang_rows'),
    )
    op.create_index('ix_layout_proposal_created_at', 'layout_proposal', ['created_at'])
    op.create_index('ix_layout_proposal_user_id', 'layout_proposal', ['user_id'])


def downgrade():
    op.drop_table('layout_proposal')
