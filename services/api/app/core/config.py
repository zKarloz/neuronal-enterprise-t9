"""Configuración protegida de la API; los secretos nunca llegan a React."""
from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict
class Settings(BaseSettings):
    database_url: str = ""
    supabase_url: str = ""
    supabase_publishable_key: str = ""
    frontend_origins: str = "http://localhost:5173"
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    @property
    def origins(self):
        return [v.strip().rstrip("/") for v in self.frontend_origins.split(",") if v.strip()]
    @property
    def issuer(self):
        return self.supabase_url.rstrip("/") + "/auth/v1"
    @property
    def jwks_url(self):
        return self.issuer + "/.well-known/jwks.json"
@lru_cache
def settings():
    return Settings()
