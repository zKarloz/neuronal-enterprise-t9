"""FastAPI; despliegue en Render con funciones de base y auth separadas."""
from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.orm import Session
from app.core.config import settings
from app.core.database import get_db
from app.core.auth import current_user, Identity
from app.api.projects import router
from app.api.authentication import router as authentication_router
from app.api.google_oauth import router as google_oauth_router
from app.api.datasets import router as datasets_router
from app.api.training import router as training_router
from app.api.reports import router as reports_router
from app.api.administration import router as administration_router
from app.api.workspace_backups import router as workspace_backups_router
from app.models.entities import User
api = FastAPI(title="NeuroLab Enterprise", version="0.12.3")


class PublicCORS(CORSMiddleware):
    """CORS externo: incluso los errores 500 incluyen la cabecera de origen.

    Conservar dependency_overrides para las pruebas y los integradores de FastAPI.
    Nunca usar `*` con orígenes desconocidos en producción.
    """
    @property
    def dependency_overrides(self):
        return self.app.dependency_overrides

@api.get("/api/v1/health")
def health():return {"status":"ok","version":"0.12.3"}
@api.get("/api/v1/ready")
def ready(db:Session=Depends(get_db)):
    try: db.execute(text("SELECT 1"))
    except Exception: raise HTTPException(503,"PostgreSQL no disponible") from None
    return {"status":"ready"}
@api.get("/api/v1/me")
def me(identity:Identity=Depends(current_user)):return {"id":identity.id,"email":identity.email}


@api.post("/api/v1/me/register")
def register_me(identity: Identity = Depends(current_user), db: Session = Depends(get_db)):
    """Registrar al usuario autenticado para habilitar invitaciones por correo.

    Los datos provienen del JWT verificado, nunca de un correo enviado por el cliente.
    """
    user = db.get(User, identity.id)
    if user is None:
        user = User(id=identity.id, email=identity.email.lower() if identity.email else None)
        db.add(user)
    elif identity.email and user.email != identity.email.lower():
        user.email = identity.email.lower()
    db.commit()
    return {"id": identity.id, "email": user.email}
api.include_router(router,prefix="/api/v1")
api.include_router(authentication_router,prefix="/api/v1")
api.include_router(google_oauth_router,prefix="/api/v1")

api.include_router(datasets_router,prefix="/api/v1")

api.include_router(training_router,prefix="/api/v1")
api.include_router(reports_router,prefix="/api/v1")
api.include_router(administration_router,prefix="/api/v1")
api.include_router(workspace_backups_router,prefix="/api/v1")

# Envoltura exterior recomendada por Starlette: el 500 de ServerErrorMiddleware
# pasa igualmente por CORS, evitando errores ambiguos en el navegador.
app = PublicCORS(
    app=api,
    allow_origins=settings().origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)
