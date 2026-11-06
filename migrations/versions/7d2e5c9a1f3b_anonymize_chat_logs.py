"""anonymize chat logs: replace user_ip with daily visitor_id

Revision ID: 7d2e5c9a1f3b
Revises: 3c1f9a7b2e4d
Create Date: 2026-11-06 14:00:00

WARNING: upgrading drops the user_ip column, permanently deleting stored IP addresses.
Existing rows keep their messages but get no visitor_id. Back up the database first if
you might ever need the old IPs (e.g. `heroku pg:backups:capture`).

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '7d2e5c9a1f3b'
down_revision = '3c1f9a7b2e4d'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'visitor_salt',
        sa.Column('day', sa.Date(), nullable=False),
        sa.Column('salt', sa.String(length=64), nullable=False),
        sa.PrimaryKeyConstraint('day'),
    )
    with op.batch_alter_table('chat_log') as batch_op:
        batch_op.add_column(sa.Column('visitor_id', sa.String(length=16), nullable=True))
        batch_op.drop_column('user_ip')

    # Dropping a column only hides the data; it stays on disk until the table is rewritten.
    # VACUUM rewrites it so the old IP addresses are physically erased. VACUUM can't run inside
    # a transaction, hence the autocommit block.
    dialect = op.get_bind().dialect.name
    with op.get_context().autocommit_block():
        if dialect == 'postgresql':
            op.execute('VACUUM FULL chat_log')
        elif dialect == 'sqlite':
            op.execute('VACUUM')


def downgrade():
    # The deleted IP addresses can't be restored; this only recreates the empty column
    with op.batch_alter_table('chat_log') as batch_op:
        batch_op.add_column(sa.Column('user_ip', sa.String(length=45), nullable=True))
        batch_op.drop_column('visitor_id')
    op.drop_table('visitor_salt')
