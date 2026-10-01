"""Messages du formulaire de contact (Phase 8, #131).

Une table nouvelle, rien de modifié : l'ancien code continue d'écrire comme avant (ADR 0010, ADR 0019).

Revision ID: 0014_messages_de_contact
Revises: 0013_mises_en_page_proposees
Create Date: 2026-10-01
"""
import sqlalchemy as sa
from alembic import op

revision = '0014_messages_de_contact'
down_revision = '0013_mises_en_page_proposees'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'contact_message',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('site', sa.String(length=10), nullable=False),
        sa.Column('lang', sa.String(length=5), nullable=False),
        sa.Column('reason', sa.String(length=20), nullable=False),
        sa.Column('message', sa.Text(), nullable=False),
        sa.Column('reply_email', sa.String(length=254), nullable=True),
        sa.Column('request_id', sa.String(length=64), nullable=True),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('user.id', ondelete='CASCADE'), nullable=True),
        sa.Column('read_at', sa.DateTime(), nullable=True),
    )
    op.create_index('ix_contact_message_created_at', 'contact_message', ['created_at'])
    op.create_index('ix_contact_message_user_id', 'contact_message', ['user_id'])


def downgrade():
    op.drop_table('contact_message')
