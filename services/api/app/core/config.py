"""Configuración protegida de la API; los secretos nunca llegan a React."""
from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict
class Settings(BaseSettings):
    database_url: str = ""
    supabase_url: str = ""
    supabase_publishable_key: str = ""
    frontend_origins: str = "http://localhost:5173"
    # Preferimos sb_secret_... en Render (la clave legacy service_role es compatible).
    supabase_secret_key: str = ""
    supabase_service_role_key: str = ""
    dataset_bucket: str = "neurolab-datasets"
    model_bucket: str = "neurolab-models"
    # Cuotas defensivas del servicio; el cliente nunca decide los límites.
    max_projects_per_user: int = 20
    max_members_per_project: int = 20
    max_datasets_per_project: int = 50
    max_architectures_per_project: int = 100
    # URL fija para evitar redirecciones a dominios no autorizados.
    auth_frontend_url: str = ""
    oauth_callback_url: str = ""
    oauth_frontend_url: str = ""
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
