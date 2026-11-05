"""Acceso exclusivo del servidor a Supabase Storage privado.

La clave service_role se conserva únicamente en Render. Las rutas se generan
con UUID internos y nunca usan nombres de archivo provistos por usuarios.
"""
from urllib.parse import quote

import httpx
from fastapi import HTTPException
from app.core.config import settings


class PrivateStorage:
    def __init__(self):
        config = settings()
        key = config.supabase_secret_key or config.supabase_service_role_key
        if not (config.supabase_url and key):
            raise HTTPException(503, "Supabase Storage no está configurado en la API.")
        self.endpoint = config.supabase_url.rstrip("/") + "/storage/v1/object/"
        self.bucket = config.dataset_bucket
        # Para sb_secret_... el Gateway exige "apikey" y no un Bearer JWT.
        # Con claves legacy service_role JWT también enviar Authorization Bearer.
        self.headers = {"apikey": key}
        if not key.startswith("sb_secret_"):
            self.headers["Authorization"] = f"Bearer {key}"

    def url(self, key: str) -> str:
        return self.endpoint + quote(self.bucket, safe="") + "/" + quote(key, safe="/")

    async def upload_model(self, key: str, content: bytes) -> None:
        """Guarda un artefacto .keras en bucket privado separado, sin exponer claves al navegador."""
        bucket = settings().model_bucket
        target = self.endpoint + quote(bucket, safe="") + "/" + quote(key, safe="/")
        try:
            async with httpx.AsyncClient(timeout=90.0) as client:
                result = await client.post(target, headers={**self.headers,
                    "Content-Type": "application/octet-stream", "x-upsert": "false"}, content=content)
            if result.status_code not in (200, 201):
                raise HTTPException(502, "No se pudo guardar el modelo en Storage privado.")
        except httpx.HTTPError:
            raise HTTPException(503, "Storage no respondió al guardar el modelo.") from None

    async def read_model(self, key: str) -> bytes:
        """Descarga privada y acotada de un artefacto Keras para un usuario autorizado.

        La API valida permisos antes de llamar a este método. Nunca se devuelve
        una URL firmada ni se envía la clave de Supabase al navegador.
        """
        bucket = settings().model_bucket
        target = self.endpoint + "authenticated/" + quote(bucket, safe="") + "/" + quote(key, safe="/")
        max_bytes = 50 * 1024 * 1024
        try:
            async with httpx.AsyncClient(timeout=90.0) as client:
                async with client.stream("GET", target, headers=self.headers) as result:
                    if result.status_code != 200:
                        raise HTTPException(502, "No se pudo recuperar el modelo privado.")
                    chunks: list[bytes] = []
                    size = 0
                    async for chunk in result.aiter_bytes():
                        size += len(chunk)
                        if size > max_bytes:
                            raise HTTPException(413, "El modelo supera el límite de descarga de 50 MB.")
                        chunks.append(chunk)
                    return b"".join(chunks)
        except httpx.HTTPError:
            raise HTTPException(503, "Storage no respondió al recuperar el modelo.") from None

    async def upload(self, key: str, content: bytes) -> None:
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                result = await client.post(self.url(key), headers={**self.headers, "Content-Type": "text/csv", "x-upsert": "false"}, content=content)
            if result.status_code not in (200, 201):
                raise HTTPException(502, "No se pudo guardar el dataset en Supabase Storage. Comprueba el bucket privado y sus credenciales.")
        except httpx.HTTPError:
            raise HTTPException(503, "Supabase Storage no responde.") from None

    async def read(self, key: str) -> bytes:
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                result = await client.get(self.url(key).replace("/object/", "/object/authenticated/", 1), headers=self.headers)
            if result.status_code != 200:
                raise HTTPException(502, "No se pudo leer el archivo privado.")
            return result.content
        except httpx.HTTPError:
            raise HTTPException(503, "Supabase Storage no responde.") from None

    async def delete(self, key: str) -> None:
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                result = await client.delete(self.url(key), headers=self.headers)
            if result.status_code not in (200, 204):
                raise HTTPException(502, "No se pudo eliminar el archivo privado.")
        except httpx.HTTPError:
            raise HTTPException(503, "Supabase Storage no responde.") from None


def get_storage() -> PrivateStorage:
    """Dependencia sustituible por un almacenamiento falso en las pruebas."""
    return PrivateStorage()
