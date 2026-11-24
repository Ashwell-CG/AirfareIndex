import logging
import os
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app import errors
from app.routes.api import router
from app.services.predictor import PredictorService

logging.basicConfig(level=os.environ.get("AIRFARE_LOG_LEVEL", "INFO").upper(), format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("airfareindex")

MAX_BODY_BYTES = 16 * 1024
# Development default; in production set AIRFARE_CORS_ORIGINS to the exact public frontend origin(s).
DEV_ORIGINS = "http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173,http://127.0.0.1:4173"


def cors_origins() -> list[str]:
    raw = os.environ.get("AIRFARE_CORS_ORIGINS", DEV_ORIGINS)
    return [o.strip().rstrip("/") for o in raw.split(",") if o.strip()]


def is_production() -> bool:
    return os.environ.get("AIRFARE_ENV", "development").lower() == "production"


def create_app(load_model: bool = True) -> FastAPI:
    prod = is_production()
    origins = cors_origins()
    if prod and (not origins or "*" in origins):
        raise RuntimeError("AIRFARE_CORS_ORIGINS must list the exact frontend origin(s) in production (no wildcard).")

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        app.state.predictor = PredictorService()
        if load_model:
            t = time.perf_counter()
            app.state.predictor.load()                        # once per process, not per request
            log.info("startup: env=%s model_ready=%s load=%.1fs cors=%s", "production" if prod else "development",
                     app.state.predictor.ready, time.perf_counter() - t, origins)
        yield

    # Interactive docs and the OpenAPI schema are disabled in production (not needed by the app, smaller attack surface).
    app = FastAPI(title="AirfareIndex API", version="1.0.0", lifespan=lifespan,
                  docs_url=None if prod else "/docs", redoc_url=None if prod else "/redoc", openapi_url=None if prod else "/openapi.json")
    app.add_middleware(CORSMiddleware, allow_origins=origins, allow_methods=["GET", "POST", "OPTIONS"], allow_headers=["Content-Type", "Accept"],
                       allow_credentials=False, max_age=600)

    @app.middleware("http")
    async def observe(request: Request, call_next):
        start = time.perf_counter()
        if int(request.headers.get("content-length") or 0) > MAX_BODY_BYTES:      # a valid request is < 1 KB
            return JSONResponse({"error": "payload_too_large", "message": "Request body is too large.", "fields": []}, status_code=413)
        response = await call_next(request)
        ms = (time.perf_counter() - start) * 1000
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "no-referrer"
        if request.url.path == "/predict":
            response.headers["Cache-Control"] = "no-store"
        if request.url.path not in ("/health",):                 # request log without bodies or query strings
            log.info("%s %s -> %s %.0fms", request.method, request.url.path, response.status_code, ms)
        return response

    errors.install(app)
    app.include_router(router)
    return app


app = create_app()
