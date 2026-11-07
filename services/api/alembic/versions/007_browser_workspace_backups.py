"""Copias de navegador privadas por usuario (independientes del historial Keras)."""
from alembic import op
import sqlalchemy as sa

revision = "007_browser_workspace_backups"
down_revision = "006_administration_audit"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "browser_workspace_backups",
        sa.Column("user_id", sa.Uuid(as_uuid=True), sa.ForeignKey("users.id"), primary_key=True),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("workspace_json", sa.JSON(), nullable=False),
        sa.Column("sha256", sa.String(64), nullable=False),
        sa.Column("size_bytes", sa.Integer(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )


def downgrade():
    op.drop_table("browser_workspace_backups")
