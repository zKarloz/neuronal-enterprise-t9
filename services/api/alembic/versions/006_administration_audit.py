"""M10: auditoría con objetivo y detalles estructurados (sin datos sensibles)."""
from alembic import op
import sqlalchemy as sa

revision = "006_administration_audit"
down_revision = "005_registry_early_stopping"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("audit_events") as batch:
        batch.add_column(sa.Column("target_id", sa.String(36), nullable=True))
        batch.add_column(sa.Column("details_json", sa.JSON(), nullable=True))
    op.create_index("ix_audit_project_created", "audit_events", ["project_id", "created_at"])


def downgrade():
    op.drop_index("ix_audit_project_created", table_name="audit_events")
    with op.batch_alter_table("audit_events") as batch:
        batch.drop_column("details_json")
        batch.drop_column("target_id")
