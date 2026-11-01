"""Verificación independiente de JWT Supabase RS256/ES256 con JWKS público."""
from dataclasses import dataclass
from functools import lru_cache
from uuid import UUID
import jwt
from jwt import PyJWKClient
from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from app.core.config import settings
bearer = HTTPBearer(auto_error=False)
@dataclass(frozen=True)
class Identity:
    id: UUID
    email: str | None
@lru_cache
def jwks(url):
    return PyJWKClient(url, cache_jwk_set=True, lifespan=300)
def current_user(credentials: HTTPAuthorizationCredentials | None = Depends(bearer)) -> Identity:
    if credentials is None:
        raise HTTPException(401, "Es necesario iniciar sesión.")
    config = settings()
    if not config.supabase_url:
        raise HTTPException(503, "Supabase Auth no está configurado.")
    try:
        key = jwks(config.jwks_url).get_signing_key_from_jwt(credentials.credentials).key
        claims = jwt.decode(credentials.credentials, key, algorithms=["RS256","ES256"], audience="authenticated", issuer=config.issuer, options={"require": ["sub","exp","aud","iss"]})
        return Identity(UUID(str(claims["sub"])), claims.get("email"))
    except (jwt.PyJWTError, ValueError, TypeError, KeyError, OSError):
        raise HTTPException(401, "Sesión inválida o expirada.") from None
