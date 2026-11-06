"""add user_ip column and widen assistant_message

Revision ID: 3c1f9a7b2e4d
Revises: 2708a78dbf25
Create Date: 2026-11-06 10:30:00

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '3c1f9a7b2e4d'
down_revision = '2708a78dbf25'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('chat_log') as batch_op:
        batch_op.alter_column('assistant_message',
                              existing_type=sa.String(length=255),
                              type_=sa.String(length=3000),
                              existing_nullable=False)
        batch_op.add_column(sa.Column('user_ip', sa.String(length=45), nullable=True))


def downgrade():
    with op.batch_alter_table('chat_log') as batch_op:
        batch_op.drop_column('user_ip')
        batch_op.alter_column('assistant_message',
                              existing_type=sa.String(length=3000),
                              type_=sa.String(length=255),
                              existing_nullable=False)
