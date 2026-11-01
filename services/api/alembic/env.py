"""Migración operativa; DATABASE_URL se consulta en el entorno del servidor."""
from alembic import context
from sqlalchemy import create_engine, pool
from app.core.config import settings
from app.core.database import Base
from app.models import entities  # noqa: F401
config=context.config
url=settings().database_url
if not url: raise RuntimeError("DATABASE_URL no configurada")
if url.startswith("postgres://"): url=url.replace("postgres://","postgresql+psycopg://",1)
elif url.startswith("postgresql://"):url=url.replace("postgresql://","postgresql+psycopg://",1)
if context.is_offline_mode():
    context.configure(url=url,target_metadata=Base.metadata,literal_binds=True)
    with context.begin_transaction():context.run_migrations()
else:
    engine=create_engine(url,poolclass=pool.NullPool)
    with engine.connect() as connection:
        context.configure(connection=connection,target_metadata=Base.metadata)
        with context.begin_transaction():context.run_migrations()
