"""One consistent error body: {"error": code, "message": text, "fields": [{"field", "message"}]}."""
from __future__ import annotations

import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

log = logging.getLogger("airfareindex")


class ApiError(Exception):
    def __init__(self, status: int, code: str, message: str, fields: list[dict] | None = None):
        self.status, self.code, self.message, self.fields = status, code, message, fields or []


def _body(code: str, message: str, fields=None) -> dict:
    return {"error": code, "message": message, "fields": fields or []}


def install(app: FastAPI) -> None:
    @app.exception_handler(ApiError)
    async def _api(_: Request, e: ApiError):
        return JSONResponse(_body(e.code, e.message, e.fields), status_code=e.status)

    @app.exception_handler(RequestValidationError)
    async def _validation(_: Request, e: RequestValidationError):
        fields = [{"field": ".".join(str(p) for p in err["loc"][1:]) or None, "message": err["msg"]} for err in e.errors()]
        return JSONResponse(_body("validation_error", "Some inputs are missing or invalid.", fields), status_code=422)

    @app.exception_handler(StarletteHTTPException)
    async def _http(_: Request, e: StarletteHTTPException):
        return JSONResponse(_body("http_error", str(e.detail)), status_code=e.status_code)

    @app.exception_handler(Exception)
    async def _unexpected(_: Request, e: Exception):
        log.exception("unhandled error")
        return JSONResponse(_body("internal_error", "Something went wrong on the server."), status_code=500)
