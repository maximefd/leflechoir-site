"""Suggestions de mots des utilisateurs : retirer ou ajouter (roadmap 1e, #144, #145).

Revision ID: 0010_suggestions_de_mots
Revises: 0009_normalisation_unique
Create Date: 2026-09-27
"""
import sqlalchemy as sa
from alembic import op

revision = '0010_suggestions_de_mots'
down_revision = '0009_normalisation_unique'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'word_suggestion',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('kind', sa.String(length=10), nullable=False),
        sa.Column('word', sa.String(length=50), nullable=False),
        sa.Column('display', sa.String(length=50), nullable=False),
        sa.Column('lang', sa.String(length=5), nullable=False),
        sa.Column('source', sa.String(length=20), nullable=False),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('user.id', ondelete='CASCADE'), nullable=True),
        sa.Column('visitor', sa.String(length=32), nullable=True),
        sa.Column('status', sa.String(length=10), nullable=False, server_default='pending'),
        sa.Column('decided_at', sa.DateTime(), nullable=True),
    )
    op.create_index('ix_word_suggestion_created_at', 'word_suggestion', ['created_at'])
    op.create_index('ix_word_suggestion_word', 'word_suggestion', ['word'])
    op.create_index('ix_word_suggestion_user_id', 'word_suggestion', ['user_id'])


def downgrade():
    op.drop_table('word_suggestion')
