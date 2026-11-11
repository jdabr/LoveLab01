"""track each message's outcome, tokens and timing, and add daily summaries

Revision ID: 9b3e5d7f2a1c
Revises: 7d2e5c9a1f3b
Create Date: 2026-11-11 12:00:00

Messages that fail, or that the visitor leaves before the reply finishes, are now recorded without their
text, so the message columns allow empty values. Existing rows keep their text, with the new columns empty.

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '9b3e5d7f2a1c'
down_revision = '7d2e5c9a1f3b'
branch_labels = None
depends_on = None

NEW_COLUMNS = [
    sa.Column('outcome', sa.String(length=16), nullable=True),
    sa.Column('model', sa.String(length=64), nullable=True),
    sa.Column('input_tokens', sa.Integer(), nullable=True),
    sa.Column('output_tokens', sa.Integer(), nullable=True),
    sa.Column('first_text_ms', sa.Integer(), nullable=True),
    sa.Column('reply_ms', sa.Integer(), nullable=True),
    sa.Column('crisis_resources', sa.Boolean(), nullable=True),
]


def upgrade():
    with op.batch_alter_table('chat_log') as batch_op:
        batch_op.alter_column('user_message', existing_type=sa.String(length=255), nullable=True)
        batch_op.alter_column('assistant_message', existing_type=sa.String(length=3000), nullable=True)
        for column in NEW_COLUMNS:
            batch_op.add_column(column.copy())
        batch_op.create_index('ix_chat_log_timestamp', ['timestamp'])

    op.create_table(
        'daily_summary',
        sa.Column('day', sa.Date(), nullable=False),
        sa.Column('messages', sa.Integer(), nullable=False),
        sa.Column('visitors', sa.Integer(), nullable=False),
        sa.Column('answered', sa.Integer(), nullable=False),
        sa.Column('off_topic', sa.Integer(), nullable=False),
        sa.Column('failed', sa.Integer(), nullable=False),
        sa.Column('abandoned', sa.Integer(), nullable=False),
        sa.Column('crisis_replies', sa.Integer(), nullable=False),
        sa.Column('input_tokens', sa.BigInteger(), nullable=False),
        sa.Column('output_tokens', sa.BigInteger(), nullable=False),
        sa.Column('avg_first_text_ms', sa.Integer(), nullable=True),
        sa.Column('avg_reply_ms', sa.Integer(), nullable=True),
        sa.PrimaryKeyConstraint('day'),
    )


def downgrade():
    op.drop_table('daily_summary')
    # Rows recorded without text can't go back into columns that require it
    op.execute("DELETE FROM chat_log WHERE user_message IS NULL OR assistant_message IS NULL")
    with op.batch_alter_table('chat_log') as batch_op:
        batch_op.drop_index('ix_chat_log_timestamp')
        for column in NEW_COLUMNS:
            batch_op.drop_column(column.name)
        batch_op.alter_column('assistant_message', existing_type=sa.String(length=3000), nullable=False)
        batch_op.alter_column('user_message', existing_type=sa.String(length=255), nullable=False)
