"""Autenticación por correo/contraseña con Supabase Auth.

El navegador solo se comunica con FastAPI: la contraseña se entrega al proveedor
mediante HTTPS y nunca se guarda en PostgreSQL ni en logs del aplicativo.

Supabase Auth sigue siendo el proveedor de identidad; la publishable key
se usa EXCLUSIVAMENTE desde este servicio, no desde React.
"""
from __future__ import annotations

from typing import Any
from urllib.parse import quote
from urllib.parse import urlsplit
import httpx
from fastapi import APIRouter, Depends, HTTPException, Response
from fastapi.security import HTTPAuthorizationCredentials
from pydantic import BaseModel, Field, field_validator

from app.core.auth import bearer, current_user, Identity
from app.core.config import settings

router = APIRouter(prefix="/auth", tags=["auth"])


class EmailRequest(BaseModel):
    email: str = Field(min_length=5, max_length=320)

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        value = value.strip().lower()
        # Validación básica; la validación final pertenece al proveedor de Auth.
        if "@" not in value or "." not in value.rsplit("@", 1)[-1] or " " in value:
            raise ValueError("Introduce un correo electrónico válido.")
        return value


class VerifyRequest(EmailRequest):
    token: str = Field(pattern=r"^[0-9]{6,8}$")


class PasswordCredentials(EmailRequest):
    # Supabase impone su propia política; se exige también una longitud mínima en API.
    password: str = Field(min_length=8, max_length=128)


class RefreshRequest(BaseModel):
    refresh_token: str = Field(min_length=10, max_length=4096)


class SessionResponse(BaseModel):
    access_token: str
    refresh_token: str
    expires_in: int
    email: str


class PasswordChange(BaseModel):
    password: str = Field(min_length=8, max_length=128)


class PasswordSignUpResponse(BaseModel):
    confirmation_required: bool
    session: SessionResponse | None = None


async def supabase_post(path: str, payload: dict[str, Any], access_token: str | None = None,
                        method: str = "POST") -> dict[str, Any]:
    """Petición servidor-servidor con tiempo máximo y errores controlados."""
    config = settings()
    if not config.supabase_url or not config.supabase_publishable_key:
        raise HTTPException(503, "Autenticación todavía no configurada en el servidor.")

    headers = {
        "apikey": config.supabase_publishable_key,
        "Content-Type": "application/json",
    }
    if access_token:
        headers["Authorization"] = f"Bearer {access_token}"
    try:
        async with httpx.AsyncClient(timeout=12.0) as client:
            result = await client.request(
                method, f"{config.supabase_url.rstrip('/')}/auth/v1/{path}",
                json=payload, headers=headers,
            )
    except httpx.RequestError:
        raise HTTPException(502, "El proveedor de autenticación no está disponible.") from None

    if result.is_error:
        if result.status_code == 429:
            raise HTTPException(429, "Se alcanzó el límite de solicitudes. Intenta más tarde.")
        if path == "verify":
            raise HTTPException(401, "Código inválido, vencido o sesión expirada.")
        if path == "token?grant_type=password":
            raise HTTPException(401, "Correo o contraseña incorrectos, o cuenta pendiente de confirmar.")
        if path.startswith("token?"):
            raise HTTPException(401, "La sesión ha expirado. Inicia sesión de nuevo.")
        if path == "signup":
            raise HTTPException(400, "No fue posible crear la cuenta. Revisa el correo y la contraseña.")
        if path == "user":
            raise HTTPException(400, "No se pudo actualizar la contraseña. Comprueba que el enlace sea válido.")
        if result.status_code >= 500:
            raise HTTPException(502, "El proveedor de autenticación no está disponible.")
        raise HTTPException(400, "No fue posible completar la solicitud de acceso.")
    if not result.content:
        return {}
    try:
        data = result.json()
    except ValueError:
        raise HTTPException(502, "Respuesta inesperada del proveedor de autenticación.") from None
    if not isinstance(data, dict):
        raise HTTPException(502, "Respuesta inesperada del proveedor de autenticación.")
    return data


def session_view(data: dict[str, Any], default_email: str = "") -> SessionResponse:
    """Restringe la respuesta pública a las propiedades necesarias."""
    try:
        user = data.get("user") or {}
        email = (user.get("email") if isinstance(user, dict) else None) or default_email
        return SessionResponse(
            access_token=data["access_token"],
            refresh_token=data["refresh_token"],
            expires_in=int(data["expires_in"]),
            email=email,
        )
    except (KeyError, TypeError, ValueError):
        raise HTTPException(502, "El proveedor devolvió una sesión incompleta.") from None


@router.post("/password/signup", response_model=PasswordSignUpResponse)
async def password_signup(payload: PasswordCredentials):
    """No emitir sesión ficticia mientras Supabase exige verificar el correo."""
    data = await supabase_post("signup", {
        "email": payload.email,
        "password": payload.password,
    })
    if data.get("access_token") and data.get("refresh_token"):
        return PasswordSignUpResponse(confirmation_required=False, session=session_view(data, payload.email))
    return PasswordSignUpResponse(confirmation_required=True)


@router.post("/password/login", response_model=SessionResponse)
async def password_login(payload: PasswordCredentials):
    data = await supabase_post("token?grant_type=password", {
        "email": payload.email,
        "password": payload.password,
    })
    return session_view(data, payload.email)


@router.post("/password/recover", status_code=202)
async def password_recovery(payload: EmailRequest):
    """Enviar correo de recuperación; URL fija y jamás elegida por el cliente."""
    config = settings()
    target = urlsplit(config.auth_frontend_url)
    if not (target.scheme == "https" or target.scheme == "http" and target.hostname in ("localhost", "127.0.0.1")):
        raise HTTPException(503, "Configura AUTH_FRONTEND_URL para habilitar recuperación de contraseña.")
    if config.auth_frontend_url.rstrip("/") not in config.origins:
        raise HTTPException(503, "AUTH_FRONTEND_URL debe pertenecer a FRONTEND_ORIGINS.")
    await supabase_post(f"recover?redirect_to={quote(config.auth_frontend_url, safe='')}", {"email": payload.email})
    # No revelar si la dirección tiene una cuenta.
    return {"message": "Si existe la cuenta, recibirás instrucciones para restablecer la contraseña."}


@router.post("/password/update", status_code=204)
async def password_update(
    payload: PasswordChange,
    identity: Identity = Depends(current_user),
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
):
    """Supabase valida el token de recuperación y actualiza la contraseña.
    No guardamos el nuevo secreto en la aplicación ni en PostgreSQL.
    """
    _ = identity
    if credentials is None:
        raise HTTPException(401, "El enlace de recuperación no es válido.")
    await supabase_post("user", {"password": payload.password}, credentials.credentials, method="PUT")
    return Response(status_code=204)


@router.post("/otp", status_code=202)
async def send_otp(payload: EmailRequest):
    # Los envíos tienen límites del proveedor; agregar rate limit distribuido
    # por IP/cuenta antes de exponerlo a una gran audiencia.
    await supabase_post("otp", {"email": payload.email, "create_user": True})
    return {"message": "Si es posible, recibirás un código por correo."}


@router.post("/verify", response_model=SessionResponse)
async def verify_otp(payload: VerifyRequest):
    data = await supabase_post("verify", {
        "email": payload.email,
        "token": payload.token,
        "type": "email",
    })
    return session_view(data, payload.email)


@router.post("/refresh", response_model=SessionResponse)
async def refresh_session(payload: RefreshRequest):
    data = await supabase_post("token?grant_type=refresh_token", {
        "refresh_token": payload.refresh_token,
    })
    return session_view(data)


@router.post("/logout", status_code=204)
async def logout(
    identity: Identity = Depends(current_user),
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
):
    # identity fuerza la validación del JWT antes de solicitar su revocación.
    _ = identity
    if credentials:
        await supabase_post("logout", {}, credentials.credentials)
    return Response(status_code=204)
