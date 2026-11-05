"""Protección CORS: origen permitido y errores 500 sin ocultar su HTTP status."""
from fastapi.testclient import TestClient
from app.main import app
from app.core.config import settings
from app.core.database import get_db


def test_cors_allowed_health_and_preflight():
    origin = settings().origins[0]
    with TestClient(app) as client:
        response = client.get('/api/v1/health', headers={'Origin': origin})
        assert response.status_code == 200
        assert response.headers['access-control-allow-origin'] == origin
        preflight = client.options('/api/v1/projects', headers={
            'Origin': origin,
            'Access-Control-Request-Method': 'GET',
            'Access-Control-Request-Headers': 'authorization',
        })
        assert preflight.status_code == 200
        assert preflight.headers['access-control-allow-origin'] == origin


def test_cors_does_not_allow_unknown_origins():
    with TestClient(app) as client:
        response = client.get('/api/v1/health', headers={'Origin': 'https://no-autorizado.invalid'})
        assert response.status_code == 200
        assert 'access-control-allow-origin' not in response.headers


def test_cors_applies_to_unhandled_server_error():
    origin = settings().origins[0]

    def failing_database():
        raise RuntimeError('error interno simulado')
        yield  # Dependencia generadora, como get_db.

    app.dependency_overrides[get_db] = failing_database
    try:
        with TestClient(app, raise_server_exceptions=False) as client:
            response = client.get('/api/v1/ready', headers={'Origin': origin})
        assert response.status_code == 500
        assert response.headers['access-control-allow-origin'] == origin
        assert 'error interno simulado' not in response.text
    finally:
        app.dependency_overrides.clear()
