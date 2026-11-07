"""Registro y acceso con Supabase: nunca se inventan JWT ni se almacenan contraseñas."""
from fastapi import HTTPException
from fastapi.testclient import TestClient
from app.api import authentication
from app.main import app


def test_password_signup_requires_valid_inputs():
    with TestClient(app) as client:
        assert client.post('/api/v1/auth/password/signup', json={'email': 'no-es-correo', 'password': '12345678'}).status_code == 422
        assert client.post('/api/v1/auth/password/login', json={'email': 'a@example.com', 'password': '123'}).status_code == 422


def test_password_signup_requires_email_confirmation(monkeypatch):
    called = []
    async def fake(path, payload, access_token=None):
        called.append((path, payload))
        return {'user': {'id': 'some-id'}}
    monkeypatch.setattr(authentication, 'supabase_post', fake)
    with TestClient(app) as client:
        response = client.post('/api/v1/auth/password/signup', json={
            'email': ' Demo@Example.org ', 'password': 'a-secret-1234',
        })
    assert response.status_code == 200
    assert response.json() == {'confirmation_required': True, 'session': None}
    assert called == [('signup', {'email': 'demo@example.org', 'password': 'a-secret-1234'})]


def test_signup_without_confirmation_returns_real_session(monkeypatch):
    async def fake(path, payload, access_token=None):
        assert path == 'signup'
        return {'access_token': 'real-access-token', 'refresh_token': 'real-refresh-token',
                'expires_in': 3600, 'user': {'email': payload['email']}}
    monkeypatch.setattr(authentication, 'supabase_post', fake)
    with TestClient(app) as client:
        result = client.post('/api/v1/auth/password/signup', json={
            'email': 'demo@example.org', 'password': 'a-secret-1234',
        })
    assert result.status_code == 200
    assert result.json()['session']['access_token'] == 'real-access-token'
    assert result.json()['confirmation_required'] is False


def test_password_login_via_provider(monkeypatch):
    called = []
    async def fake(path, payload, access_token=None):
        called.append((path, payload))
        return {'access_token': 'jwt', 'refresh_token': 'refresh', 'expires_in': 3600,
                'user': {'email': 'demo@example.org'}}
    monkeypatch.setattr(authentication, 'supabase_post', fake)
    with TestClient(app) as client:
        response = client.post('/api/v1/auth/password/login', json={
            'email': 'demo@example.org', 'password': 'correct-password',
        })
    assert response.status_code == 200
    assert response.json()['email'] == 'demo@example.org'
    assert called == [('token?grant_type=password', {
        'email': 'demo@example.org', 'password': 'correct-password',
    })]


def test_wrong_password_does_not_expose_provider_errors(monkeypatch):
    async def fake(path, payload, access_token=None):
        raise HTTPException(401, 'Correo o contraseña incorrectos, o cuenta pendiente de confirmar.')
    monkeypatch.setattr(authentication, 'supabase_post', fake)
    with TestClient(app) as client:
        response = client.post('/api/v1/auth/password/login', json={
            'email': 'demo@example.org', 'password': 'wrong-password',
        })
    assert response.status_code == 401
    assert 'incorrectos' in response.json()['detail']


def test_recover_uses_fixed_allowed_origin(monkeypatch):
    from types import SimpleNamespace
    paths = []
    async def fake(path, data, access_token=None, method='POST'):
        paths.append((path, data))
        return {}
    monkeypatch.setattr(authentication, 'supabase_post', fake)
    monkeypatch.setattr(authentication, 'settings', lambda: SimpleNamespace(
        auth_frontend_url='https://neurolab.example.com', origins=['https://neurolab.example.com'],
    ))
    with TestClient(app) as client:
        response = client.post('/api/v1/auth/password/recover', json={'email': 'demo@example.org'})
    assert response.status_code == 202
    assert paths[0][0].startswith('recover?redirect_to=https%3A%2F%2Fneurolab.example.com')
    assert paths[0][1] == {'email': 'demo@example.org'}


def test_recover_rejects_invalid_redirect(monkeypatch):
    from types import SimpleNamespace
    monkeypatch.setattr(authentication, 'settings', lambda: SimpleNamespace(
        auth_frontend_url='http://example.com', origins=['http://example.com'],
    ))
    with TestClient(app) as client:
        response = client.post('/api/v1/auth/password/recover', json={'email': 'demo@example.org'})
    assert response.status_code == 503


def test_update_password_requires_identity():
    with TestClient(app) as client:
        result = client.post('/api/v1/auth/password/update', json={'password': 'new-password-1234'})
    assert result.status_code == 401


def test_password_update_is_forwarded_to_supabase_for_verified_account(monkeypatch):
    from uuid import uuid4
    from app.core.auth import Identity, current_user
    invoked = []
    async def fake(path, payload, access_token=None, method='POST'):
        invoked.append((path, payload, access_token, method))
        return {'email': 'demo@example.org'}
    monkeypatch.setattr(authentication, 'supabase_post', fake)
    app.dependency_overrides[current_user] = lambda: Identity(uuid4(), 'demo@example.org')
    try:
        with TestClient(app) as client:
            response = client.post('/api/v1/auth/password/update',
                headers={'Authorization': 'Bearer verified-recovery-jwt'},
                json={'password': 'new-safe-password-123'})
        assert response.status_code == 204
        assert invoked == [('user', {'password': 'new-safe-password-123'}, 'verified-recovery-jwt', 'PUT')]
    finally:
        app.dependency_overrides.clear()
