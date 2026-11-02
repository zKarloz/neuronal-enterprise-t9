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
app=FastAPI(title="NeuroLab Enterprise",version="0.5.0")
app.add_middleware(CORSMiddleware,allow_origins=settings().origins,allow_credentials=False,allow_methods=["GET","POST","PATCH","DELETE","OPTIONS"],allow_headers=["Authorization","Content-Type"])
@app.get("/api/v1/health")
def health():return {"status":"ok","version":"0.5.0"}
@app.get("/api/v1/ready")
def ready(db:Session=Depends(get_db)):
    try: db.execute(text("SELECT 1"))
    except Exception: raise HTTPException(503,"PostgreSQL no disponible") from None
    return {"status":"ready"}
@app.get("/api/v1/me")
def me(identity:Identity=Depends(current_user)):return {"id":identity.id,"email":identity.email}
app.include_router(router,prefix="/api/v1")
app.include_router(authentication_router,prefix="/api/v1")
app.include_router(google_oauth_router,prefix="/api/v1")

app.include_router(datasets_router,prefix="/api/v1")
