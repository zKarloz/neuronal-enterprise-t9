"""Copias por cuenta: aislamiento, conflictos, límites y recuperación sin pérdidas."""
from uuid import uuid4
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool
from app.core.auth import Identity, current_user
from app.core.database import Base, get_db
from app.main import app


@pytest.fixture
def clients():
    engine = create_engine('sqlite+pysqlite://', connect_args={'check_same_thread': False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    ids = [Identity(uuid4(), 'first@example.org'), Identity(uuid4(), 'second@example.org')]
    state = {'user': ids[0]}

    def connect():
        with Session(engine) as db:
            yield db

    app.dependency_overrides[get_db] = connect
    app.dependency_overrides[current_user] = lambda: state['user']
    with TestClient(app) as client:
        yield client, state, ids
    app.dependency_overrides.clear()
    engine.dispose()


def workspace():
    return {
        'projects': [{'id':'project-a','name':'Proyecto real','description':'','status':'active',
                      'createdAt':'2026-01-01','updatedAt':'2026-01-01'}],
        'architectures': [{'id':'arch-a', 'projectId':'project-a', 'family':'feedforward',
                           'name':'Modelo', 'hiddenLayers':[], 'updatedAt':'2026-01-01'}],
        'datasets': [{'id':'dataset-a','projectId':'project-a','name':'dataset.csv','headers':['x','y'],
                      'rows':[[1,0],[2,1]],'target':'y','kind':'tabular','createdAt':'2026-01-01'}],
        'runs': [], 'models': [], 'activeProjectId':'project-a', 'activeArchitectureIds':{'project-a':'arch-a'},
    }


def test_backup_is_private_and_restorable(clients):
    client, state, identities = clients
    assert client.get('/api/v1/workspace-backup/status').json()['exists'] is False
    assert client.get('/api/v1/workspace-backup').status_code == 404
    saved = client.put('/api/v1/workspace-backup', json={'expected_revision':0,'workspace':workspace()})
    assert saved.status_code == 200, saved.text
    assert saved.json()['revision'] == 1
    assert saved.json()['sha256'] and saved.json()['size_bytes'] > 100
    assert client.get('/api/v1/workspace-backup').json()['workspace'] == workspace()
    assert client.get('/api/v1/workspace-backup').headers.get('cache-control') == 'no-store'
    state['user'] = identities[1]
    assert client.get('/api/v1/workspace-backup/status').json()['revision'] == 0
    assert client.get('/api/v1/workspace-backup').status_code == 404
    second = workspace()
    second['projects'][0]['name'] = 'Otro usuario'
    assert client.put('/api/v1/workspace-backup', json={'expected_revision':0,'workspace':second}).status_code == 200
    state['user'] = identities[0]
    assert client.get('/api/v1/workspace-backup').json()['workspace']['projects'][0]['name'] == 'Proyecto real'


def test_expected_revision_prevents_accidental_overwrite(clients):
    client, _, __ = clients
    url = '/api/v1/workspace-backup'
    assert client.put(url, json={'expected_revision':1,'workspace':workspace()}).status_code == 409
    assert client.put(url, json={'expected_revision':0,'workspace':workspace()}).status_code == 200
    assert client.put(url, json={'expected_revision':0,'workspace':workspace()}).status_code == 409
    updated = workspace()
    updated['projects'][0]['description'] = 'Actualizada'
    ok = client.put(url, json={'expected_revision':1,'workspace':updated})
    assert ok.status_code == 200 and ok.json()['revision'] == 2
    assert client.get(url).json()['workspace']['projects'][0]['description'] == 'Actualizada'


def test_rejects_invalid_references_or_payloads(clients):
    client, _, __ = clients
    url = '/api/v1/workspace-backup'
    bad = workspace()
    bad['datasets'][0]['rows'] = [[1,2,3]]
    assert client.put(url, json={'expected_revision':0,'workspace':bad}).status_code == 422
    bad = workspace()
    bad['datasets'][0]['projectId'] = 'nonexistent'
    assert client.put(url, json={'expected_revision':0,'workspace':bad}).status_code == 422
    bad = workspace()
    bad['projects'] = bad['projects'] * 2
    assert client.put(url, json={'expected_revision':0,'workspace':bad}).status_code == 422
    bad = workspace()
    bad['projects'][0]['description'] = 'a' * (3 * 1024 * 1024)
    assert client.put(url, json={'expected_revision':0,'workspace':bad}).status_code == 413
    assert client.get(url + '/status').json()['exists'] is False


def test_backup_does_not_change_server_projects_or_workers(clients):
    client, _, __ = clients
    assert client.put('/api/v1/workspace-backup', json={'expected_revision':0,'workspace':workspace()}).status_code == 200
    assert client.get('/api/v1/projects').json() == []
    status = client.get('/api/v1/workspace-backup/status')
    assert status.status_code == 200 and 'workspace' not in status.json()
