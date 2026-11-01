"""Persistencia PostgreSQL; el engine solo se crea con una URL real."""
from functools import lru_cache
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session
from app.core.config import settings
class Base(DeclarativeBase):
    pass
@lru_cache
def engine(url):
    if url.startswith("postgres://"):
        url = url.replace("postgres://", "postgresql+psycopg://", 1)
    elif url.startswith("postgresql://"):
        url = url.replace("postgresql://", "postgresql+psycopg://", 1)
    return create_engine(url, pool_pre_ping=True)
def get_db():
    if not settings().database_url:
        raise HTTPException(503, "PostgreSQL no está configurado.")
    with Session(engine(settings().database_url)) as session:
        yield session
