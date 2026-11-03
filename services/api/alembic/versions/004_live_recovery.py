"""SSE y recuperación supervisada: heartbeat, token y linaje de reintentos.

Revision ID: 004_live_recovery
Revises: 003_training
"""
from alembic import op
import sqlalchemy as sa

revision = "004_live_recovery"
down_revision = "003_training"
branch_labels = None
depends_on = None


def upgrade():
    # Nullable para preservar sin reescritura el historial creado en v0.6.0.
    with op.batch_alter_table("training_jobs") as batch:
        batch.add_column(sa.Column("worker_token", sa.String(36), nullable=True))
        batch.add_column(sa.Column("heartbeat_at", sa.DateTime(timezone=True), nullable=True))
        batch.add_column(sa.Column("retry_of_job_id", sa.Uuid(), nullable=True))
        batch.create_foreign_key("fk_training_jobs_retry", "training_jobs",
                                 ["retry_of_job_id"], ["id"])


def downgrade():
    with op.batch_alter_table("training_jobs") as batch:
        batch.drop_constraint("fk_training_jobs_retry", type_="foreignkey")
        batch.drop_column("retry_of_job_id")
        batch.drop_column("heartbeat_at")
        batch.drop_column("worker_token")
