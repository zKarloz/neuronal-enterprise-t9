"""Google OAuth de Supabase mediante la API propia y PKCE.

El navegador solo consulta la API; las navegaciones por Google y Supabase
son redirecciones top-level. Nunca incluimos JWT ni refresh tokens en URLs.
"""
from __future__ import annotations

import re
from urllib.parse import urlencode, urlsplit

from fastapi import APIRouter, Cookie, HTTPException, Query
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, Field

from app.api.authentication import SessionResponse, session_view, supabase_post
from app.core.config import settings

router = APIRouter(prefix="/auth/google", tags=["auth"])
STATE_COOKIE = "neurolab_oauth_state"
STATE_RE = re.compile(r"^[A-Za-z0-9_-]{32,128}$")
CHALLENGE_RE = re.compile(r"^[A-Za-z0-9_-]{43}$")
VERIFIER_RE = re.compile(r"^[A-Za-z0-9._~-]{43,128}$")


def oauth_settings():
    """Fallar cerrado cuando falta la configuración de redirecciones."""
    config = settings()
    if not (config.supabase_url and config.supabase_publishable_key and
            config.oauth_callback_url and config.oauth_frontend_url):
        raise HTTPException(503, "Google OAuth todavía no está configurado.")
    callback = urlsplit(config.oauth_callback_url)
    frontend = urlsplit(config.oauth_frontend_url)
    if callback.scheme not in ("http", "https") or frontend.scheme not in ("http", "https"):
        raise HTTPException(503, "URL de OAuth incorrecta.")
    if callback.scheme != "https" and callback.hostname not in ("localhost", "127.0.0.1"):
        raise HTTPException(503, "OAuth requiere HTTPS.")
    if frontend.scheme != "https" and frontend.hostname not in ("localhost", "127.0.0.1"):
        raise HTTPException(503, "OAuth requiere HTTPS.")
    if callback.path != "/api/v1/auth/google/callback" or callback.query or callback.fragment:
        raise HTTPException(503, "La URL de callback de OAuth es incorrecta.")
    if frontend.query or frontend.fragment or frontend.path not in ("", "/"):
        raise HTTPException(503, "La URL del frontend de OAuth es incorrecta.")
    if config.oauth_frontend_url.rstrip("/") not in config.origins:
        raise HTTPException(503, "El frontend OAuth no está incluido en FRONTEND_ORIGINS.")
    return config


@router.get("/start")
def google_start(
    code_challenge: str = Query(min_length=43, max_length=43),
    state: str = Query(min_length=32, max_length=128),
):
    """Iniciar navegación con PKCE S256 y cookie de correlación HttpOnly."""
    config = oauth_settings()
    if not CHALLENGE_RE.fullmatch(code_challenge) or not STATE_RE.fullmatch(state):
        raise HTTPException(422, "Parámetros de autenticación inválidos.")
    params = urlencode({
        "provider": "google",
        "redirect_to": config.oauth_callback_url,
        "code_challenge": code_challenge,
        "code_challenge_method": "s256",
    })
    response = RedirectResponse(f"{config.supabase_url.rstrip('/')}/auth/v1/authorize?{params}", status_code=303)
    response.set_cookie(
        STATE_COOKIE, state, httponly=True, secure=config.oauth_callback_url.startswith("https://"),
        samesite="lax", max_age=600, path="/api/v1/auth/google",
    )
    response.headers["Cache-Control"] = "no-store"
    response.headers["Referrer-Policy"] = "no-referrer"
    return response


@router.get("/callback", name="google_callback")
def google_callback(
    code: str | None = Query(default=None, max_length=2048),
    error: str | None = Query(default=None, max_length=100),
    state_cookie: str | None = Cookie(default=None, alias=STATE_COOKIE),
):
    """Volver a React solo con código temporal y estado; nunca con tokens."""
    config = oauth_settings()
    target = config.oauth_frontend_url.rstrip("/") + "/"
    if not state_cookie or not STATE_RE.fullmatch(state_cookie):
        params = {"nl_oauth_error": "missing_state"}
    elif error:
        params = {"nl_oauth_error": "access_denied", "nl_oauth_state": state_cookie}
    elif not code:
        params = {"nl_oauth_error": "missing_code", "nl_oauth_state": state_cookie}
    else:
        params = {"nl_oauth_code": code, "nl_oauth_state": state_cookie}
    response = RedirectResponse(target + "?" + urlencode(params), status_code=303)
    response.delete_cookie(STATE_COOKIE, path="/api/v1/auth/google")
    response.headers["Cache-Control"] = "no-store"
    response.headers["Referrer-Policy"] = "no-referrer"
    return response


class GoogleExchange(BaseModel):
    auth_code: str = Field(min_length=8, max_length=2048)
    code_verifier: str = Field(min_length=43, max_length=128)


@router.post("/exchange", response_model=SessionResponse)
async def google_exchange(payload: GoogleExchange):
    """Intercambiar el código de un solo uso desde FastAPI (nunca Supabase JS)."""
    oauth_settings()
    if not VERIFIER_RE.fullmatch(payload.code_verifier):
        raise HTTPException(422, "Verificador PKCE inválido.")
    data = await supabase_post("token?grant_type=pkce", {
        "auth_code": payload.auth_code,
        "code_verifier": payload.code_verifier,
    })
    return session_view(data)
