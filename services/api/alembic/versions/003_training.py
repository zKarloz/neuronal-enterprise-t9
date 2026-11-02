"""Arquitecturas Feedforward, trabajos, métricas y artefactos inmutables.

Revision ID: 003_training
Revises: 002_datasets
"""
from alembic import op
import sqlalchemy as sa

revision = "003_training"
down_revision = "002_datasets"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("architectures",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("project_id", sa.Uuid(), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("family", sa.String(20), nullable=False),
        sa.Column("config_json", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("project_id", "name", "version", name="uq_architecture_version"))
    op.create_index("ix_architectures_project_id", "architectures", ["project_id"])
    op.create_table("training_jobs",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("project_id", sa.Uuid(), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("architecture_id", sa.Uuid(), sa.ForeignKey("architectures.id"), nullable=False),
        sa.Column("dataset_id", sa.Uuid(), sa.ForeignKey("datasets.id"), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("progress", sa.Integer(), nullable=False),
        sa.Column("epoch", sa.Integer(), nullable=False),
        sa.Column("epochs", sa.Integer(), nullable=False),
        sa.Column("batch_size", sa.Integer(), nullable=False),
        sa.Column("learning_rate", sa.Float(), nullable=False),
        sa.Column("seed", sa.Integer(), nullable=False),
        sa.Column("config_snapshot", sa.JSON(), nullable=False),
        sa.Column("preparation_snapshot", sa.JSON(), nullable=False),
        sa.Column("dataset_sha256", sa.String(64), nullable=False),
        sa.Column("cancel_requested", sa.Boolean(), nullable=False),
        sa.Column("error_message", sa.String(300), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True))
    op.create_index("ix_training_jobs_project_id", "training_jobs", ["project_id"])
    op.create_index("ix_training_jobs_status", "training_jobs", ["status"])
    op.create_table("training_metrics",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("job_id", sa.Uuid(), sa.ForeignKey("training_jobs.id", ondelete="CASCADE"), nullable=False),
        sa.Column("epoch", sa.Integer(), nullable=False),
        sa.Column("loss", sa.Float(), nullable=False),
        sa.Column("val_loss", sa.Float(), nullable=False),
        sa.Column("accuracy", sa.Float(), nullable=True),
        sa.Column("val_accuracy", sa.Float(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("job_id", "epoch", name="uq_job_epoch"))
    op.create_index("ix_training_metrics_job_id", "training_metrics", ["job_id"])
    op.create_table("model_versions",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("job_id", sa.Uuid(), sa.ForeignKey("training_jobs.id"), nullable=False, unique=True),
        sa.Column("project_id", sa.Uuid(), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("storage_key", sa.String(240), nullable=False, unique=True),
        sa.Column("sha256", sa.String(64), nullable=False),
        sa.Column("test_metrics", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False))
    op.create_index("ix_model_versions_project_id", "model_versions", ["project_id"])
    if op.get_bind().dialect.name == "postgresql":
        for name in ("architectures", "training_jobs", "training_metrics", "model_versions"):
            op.execute(f'ALTER TABLE "{name}" ENABLE ROW LEVEL SECURITY')


def downgrade():
    op.drop_index("ix_model_versions_project_id", table_name="model_versions")
    op.drop_table("model_versions")
    op.drop_index("ix_training_metrics_job_id", table_name="training_metrics")
    op.drop_table("training_metrics")
    op.drop_index("ix_training_jobs_status", table_name="training_jobs")
    op.drop_index("ix_training_jobs_project_id", table_name="training_jobs")
    op.drop_table("training_jobs")
    op.drop_index("ix_architectures_project_id", table_name="architectures")
    op.drop_table("architectures")
