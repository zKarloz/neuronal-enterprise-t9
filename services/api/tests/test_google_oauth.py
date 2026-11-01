"""Contrato del flujo Google OAuth. No contacta proveedores externos."""
from types import SimpleNamespace
from urllib.parse import parse_qs, urlparse

from fastapi.testclient import TestClient
from app.main import app
from app.api import google_oauth


SETTINGS = SimpleNamespace(
    supabase_url="https://example.supabase.co",
    supabase_publishable_key="sb_publishable_test",
    oauth_callback_url="https://neurolab-api.onrender.com/api/v1/auth/google/callback",
    oauth_frontend_url="https://neurolab.vercel.app",
    origins=["https://neurolab.vercel.app"],
)


def test_start_generates_supabase_redirect_and_correlation_cookie(monkeypatch):
    monkeypatch.setattr(google_oauth, 'settings', lambda: SETTINGS)
    with TestClient(app, base_url="https://neurolab-api.onrender.com", follow_redirects=False) as client:
        result = client.get('/api/v1/auth/google/start', params={
            'state': 'a' * 43, 'code_challenge': 'b' * 43,
        })
    assert result.status_code == 303
    target = urlparse(result.headers['location'])
    assert target.hostname == 'example.supabase.co'
    assert target.path == '/auth/v1/authorize'
    params = parse_qs(target.query)
    assert params['provider'] == ['google']
    assert params['code_challenge_method'] == ['s256']
    assert params['code_challenge'] == ['b' * 43]
    assert params['redirect_to'] == [SETTINGS.oauth_callback_url]
    assert 'HttpOnly' in result.headers['set-cookie']
    assert 'Secure' in result.headers['set-cookie']


def test_callback_returns_code_and_state_but_never_tokens(monkeypatch):
    monkeypatch.setattr(google_oauth, 'settings', lambda: SETTINGS)
    with TestClient(app, base_url="https://neurolab-api.onrender.com", follow_redirects=False) as client:
        client.get('/api/v1/auth/google/start', params={
            'state': 's' * 43, 'code_challenge': 'c' * 43,
        })
        result = client.get('/api/v1/auth/google/callback?code=one-time-code')
    assert result.status_code == 303
    target = urlparse(result.headers['location'])
    assert target.netloc == 'neurolab.vercel.app'
    args = parse_qs(target.query)
    assert args['nl_oauth_code'] == ['one-time-code']
    assert args['nl_oauth_state'] == ['s' * 43]
    assert 'access_token' not in target.query
    assert 'Max-Age=0' in result.headers['set-cookie']


def test_callback_fails_closed_without_cookie(monkeypatch):
    monkeypatch.setattr(google_oauth, 'settings', lambda: SETTINGS)
    with TestClient(app, base_url="https://neurolab-api.onrender.com", follow_redirects=False) as client:
        result = client.get('/api/v1/auth/google/callback?code=test')
    assert parse_qs(urlparse(result.headers['location']).query)['nl_oauth_error'] == ['missing_state']
    assert 'nl_oauth_code' not in result.headers['location']


def test_pkce_validation_and_provider_exchange(monkeypatch):
    monkeypatch.setattr(google_oauth, 'settings', lambda: SETTINGS)
    invoked = []

    async def fake_post(path, payload):
        invoked.append((path, payload))
        return {'access_token': 'jwt', 'refresh_token': 'refresh', 'expires_in': 3600,
                'user': {'email': 'test@gmail.com'}}

    monkeypatch.setattr(google_oauth, 'supabase_post', fake_post)
    with TestClient(app) as client:
        bad = client.post('/api/v1/auth/google/exchange', json={'auth_code': '12345678', 'code_verifier': 'weak'})
        assert bad.status_code == 422
        good = client.post('/api/v1/auth/google/exchange', json={
            'auth_code': 'valid-code', 'code_verifier': 'x' * 64,
        })
    assert good.status_code == 200
    assert good.json()['email'] == 'test@gmail.com'
    assert invoked == [('token?grant_type=pkce', {'auth_code': 'valid-code', 'code_verifier': 'x' * 64})]


def test_missing_config_rejected(monkeypatch):
    monkeypatch.setattr(google_oauth, 'settings', lambda: SimpleNamespace(
        supabase_url='', supabase_publishable_key='', oauth_callback_url='', oauth_frontend_url=''
    ))
    with TestClient(app) as client:
        res = client.get('/api/v1/auth/google/start', params={
            'state': 'a' * 43, 'code_challenge': 'b' * 43,
        })
    assert res.status_code == 503
