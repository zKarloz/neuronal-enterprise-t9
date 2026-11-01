"""NeuroLab core schema — initial migration."""
from alembic import op
import sqlalchemy as sa
revision="001_init"
down_revision=None
branch_labels=None
depends_on=None
def upgrade():
    op.create_table("users",sa.Column("id",sa.Uuid(),primary_key=True),sa.Column("email",sa.String(320)),sa.Column("created_at",sa.DateTime(timezone=True),nullable=False))
    op.create_table("projects",sa.Column("id",sa.Uuid(),primary_key=True),sa.Column("owner_id",sa.Uuid(),sa.ForeignKey("users.id"),nullable=False),sa.Column("name",sa.String(80),nullable=False),sa.Column("description",sa.Text(),nullable=False),sa.Column("status",sa.String(20),nullable=False),sa.Column("created_at",sa.DateTime(timezone=True),nullable=False),sa.Column("updated_at",sa.DateTime(timezone=True),nullable=False))
    op.create_index("ix_projects_owner_id","projects",["owner_id"])
    op.create_table("project_members",sa.Column("project_id",sa.Uuid(),sa.ForeignKey("projects.id",ondelete="CASCADE"),primary_key=True),sa.Column("user_id",sa.Uuid(),sa.ForeignKey("users.id"),primary_key=True),sa.Column("role",sa.String(24),nullable=False))
    op.create_table("audit_events",sa.Column("id",sa.Uuid(),primary_key=True),sa.Column("actor_id",sa.Uuid(),sa.ForeignKey("users.id"),nullable=False),sa.Column("project_id",sa.Uuid()),sa.Column("action",sa.String(80),nullable=False),sa.Column("created_at",sa.DateTime(timezone=True),nullable=False))
    # Impedir acceso PostgREST directo desde anon/authenticated.
    if op.get_bind().dialect.name=="postgresql":
        for table in ("users","projects","project_members","audit_events"):
            op.execute(f'ALTER TABLE "{table}" ENABLE ROW LEVEL SECURITY')
def downgrade():
    op.drop_table("audit_events");op.drop_table("project_members");op.drop_index("ix_projects_owner_id",table_name="projects");op.drop_table("projects");op.drop_table("users")
