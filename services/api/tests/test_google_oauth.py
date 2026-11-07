"""Regresión de seguridad: OAuth Google no se publica desde v0.13.0."""
from fastapi.testclient import TestClient
from app.main import app


def test_google_oauth_is_not_exposed():
    with TestClient(app, follow_redirects=False) as client:
        assert client.get('/api/v1/auth/google/start', params={
            'state': 'a' * 43, 'code_challenge': 'b' * 43,
        }).status_code == 404
        assert client.get('/api/v1/auth/google/callback?code=old').status_code == 404
        assert client.post('/api/v1/auth/google/exchange', json={
            'auth_code': 'old-code', 'code_verifier': 'v' * 43,
        }).status_code == 404
