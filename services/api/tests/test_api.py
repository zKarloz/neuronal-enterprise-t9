"""Pruebas de aislamiento por dueño y persistencia CRUD, sin Supabase real."""
from uuid import uuid4
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool
from app.core.auth import Identity,current_user
from app.core.database import Base,get_db
from app.main import app
@pytest.fixture
def client():
    e=create_engine("sqlite+pysqlite://",connect_args={"check_same_thread":False},poolclass=StaticPool)
    Base.metadata.create_all(e)
    holder={"identity":Identity(uuid4(),"test@example.org")}
    def db():
        with Session(e) as session:yield session
    app.dependency_overrides[get_db]=db
    app.dependency_overrides[current_user]=lambda:holder["identity"]
    with TestClient(app) as c:yield c,holder
    app.dependency_overrides.clear();e.dispose()
def test_health(client):
    c,_=client;assert c.get("/api/v1/health").status_code==200
    assert c.get("/api/v1/ready").json()["status"]=="ready"
def test_crud_and_isolation(client):
    c,h=client
    assert c.get("/api/v1/projects").json()==[]
    result=c.post("/api/v1/projects",json={"name":" Proyecto real "})
    assert result.status_code==201
    id=result.json()["id"]
    assert c.get("/api/v1/projects").json()[0]["name"]=="Proyecto real"
    h["identity"]=Identity(uuid4(),"other@example.org")
    assert c.get("/api/v1/projects").json()==[]
    assert c.get(f"/api/v1/projects/{id}").status_code==404
    assert c.delete(f"/api/v1/projects/{id}").status_code==404
def test_validation(client):
    c,_=client
    assert c.post("/api/v1/projects",json={"name":"x"}).status_code==422
