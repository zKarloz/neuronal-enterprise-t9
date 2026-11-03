"""Registro de modelos y Early Stopping; compatible con los históricos.

Revision ID: 005_registry_early_stopping
Revises: 004_live_recovery
"""
from alembic import op
import sqlalchemy as sa

revision = "005_registry_early_stopping"
down_revision = "004_live_recovery"
branch_labels = None
depends_on = None


def upgrade():
    # Los trabajos antiguos continúan con Early Stopping desactivado.
    with op.batch_alter_table("training_jobs") as batch:
        batch.add_column(sa.Column("early_stopping_patience", sa.Integer(), nullable=False, server_default="0"))
    with op.batch_alter_table("model_versions") as batch:
        batch.add_column(sa.Column("name", sa.String(100), nullable=False, server_default="Modelo Keras"))
        batch.add_column(sa.Column("stage", sa.String(16), nullable=False, server_default="candidate"))
        batch.add_column(sa.Column("notes", sa.String(500), nullable=False, server_default=""))
        # NULL significa desconocido para modelos ya entrenados en v0.6/v0.7.
        batch.add_column(sa.Column("best_epoch", sa.Integer(), nullable=True))
        batch.add_column(sa.Column("epochs_trained", sa.Integer(), nullable=True))
        batch.add_column(sa.Column("early_stopped", sa.Boolean(), nullable=True))
    # Como máximo un modelo en producción por proyecto, también bajo concurrencia.
    op.create_index("uq_model_versions_production_project", "model_versions", ["project_id"],
                    unique=True, postgresql_where=sa.text("stage = 'production'"),
                    sqlite_where=sa.text("stage = 'production'"))


def downgrade():
    op.drop_index("uq_model_versions_production_project", table_name="model_versions")
    with op.batch_alter_table("model_versions") as batch:
        batch.drop_column("early_stopped")
        batch.drop_column("epochs_trained")
        batch.drop_column("best_epoch")
        batch.drop_column("notes")
        batch.drop_column("stage")
        batch.drop_column("name")
    with op.batch_alter_table("training_jobs") as batch:
        batch.drop_column("early_stopping_patience")
