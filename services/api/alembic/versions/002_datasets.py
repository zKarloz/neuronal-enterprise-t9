"""Datasets CSV remotos versionados y protegidos por proyecto."""
from alembic import op
import sqlalchemy as sa

revision = "002_datasets"
down_revision = "001_init"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "datasets",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("project_id", sa.Uuid(), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(180), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("storage_key", sa.String(200), nullable=False, unique=True),
        sa.Column("sha256", sa.String(64), nullable=False),
        sa.Column("size_bytes", sa.BigInteger(), nullable=False),
        sa.Column("row_count", sa.Integer(), nullable=False),
        sa.Column("column_count", sa.Integer(), nullable=False),
        sa.Column("columns_json", sa.JSON(), nullable=False),
        sa.Column("preview_json", sa.JSON(), nullable=False),
        sa.Column("prep_json", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("project_id", "name", "version", name="uq_dataset_project_name_version"),
    )
    op.create_index("ix_datasets_project_id", "datasets", ["project_id"])
    if op.get_bind().dialect.name == "postgresql":
        op.execute('ALTER TABLE "datasets" ENABLE ROW LEVEL SECURITY')


def downgrade():
    op.drop_index("ix_datasets_project_id", table_name="datasets")
    op.drop_table("datasets")
