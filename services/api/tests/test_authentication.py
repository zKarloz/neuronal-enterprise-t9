"""Pruebas del contrato OTP mediante API propia; no envían correos reales."""
from types import SimpleNamespace

from fastapi import HTTPException
from fastapi.testclient import TestClient
from app.api import authentication
from app.main import app


def test_auth_requires_email_and_code():
    with TestClient(app) as client:
        assert client.post('/api/v1/auth/otp', json={'email': 'correo invalido'}).status_code == 422
        assert client.post('/api/v1/auth/verify', json={'email': 'demo@example.org', 'token': 'abc'}).status_code == 422
        assert client.post('/api/v1/auth/refresh', json={'refresh_token': 'abc'}).status_code == 422


def test_auth_uses_backend_as_proxy(monkeypatch):
    invoked = []

    async def fake_post(path, data, access_token=None):
        invoked.append((path, data, access_token))
        if path == 'otp':
            return {}
        if path == 'verify':
            return {
                'access_token': 'access-token', 'refresh_token': 'refresh-token',
                'expires_in': 3600, 'user': {'email': 'demo@example.org'},
            }
        if path.startswith('token?'):
            return {
                'access_token': 'renewed-token', 'refresh_token': 'renewed-refresh',
                'expires_in': 3600, 'user': {'email': 'demo@example.org'},
            }
        raise AssertionError(f'Ruta inesperada: {path}')

    monkeypatch.setattr(authentication, 'supabase_post', fake_post)
    with TestClient(app) as client:
        result = client.post('/api/v1/auth/otp', json={'email': ' Demo@Example.org '})
        assert result.status_code == 202
        verified = client.post('/api/v1/auth/verify', json={'email': 'demo@example.org', 'token': '12345678'})
        assert verified.status_code == 200
        assert verified.json() == {
            'access_token': 'access-token', 'refresh_token': 'refresh-token',
            'expires_in': 3600, 'email': 'demo@example.org',
        }
        refreshed = client.post('/api/v1/auth/refresh', json={'refresh_token': 'refresh-token'})
        assert refreshed.status_code == 200
        assert refreshed.json()['access_token'] == 'renewed-token'
    assert invoked[0] == ('otp', {'email': 'demo@example.org', 'create_user': True}, None)
    assert invoked[1][1] == {'email': 'demo@example.org', 'token': '12345678', 'type': 'email'}
    assert invoked[2][0] == 'token?grant_type=refresh_token'


def test_api_fails_closed_without_auth_provider(monkeypatch):
    monkeypatch.setattr(
        authentication, 'settings',
        lambda: SimpleNamespace(supabase_url='', supabase_publishable_key=''),
    )
    with TestClient(app) as client:
        result = client.post('/api/v1/auth/otp', json={'email': 'demo@example.org'})
        assert result.status_code == 503


def test_expired_code_has_controlled_error(monkeypatch):
    async def fake_post(path, data, access_token=None):
        raise HTTPException(401, 'Código inválido, vencido o sesión expirada.')
    monkeypatch.setattr(authentication, 'supabase_post', fake_post)
    with TestClient(app) as client:
        result = client.post('/api/v1/auth/verify', json={'email': 'demo@example.org', 'token': '123456'})
        assert result.status_code == 401
        assert 'Código inválido' in result.json()['detail']
