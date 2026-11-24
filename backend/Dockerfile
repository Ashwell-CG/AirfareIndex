# AirfareIndex API: FastAPI + the saved Phase 6 model. Build context: the backend/ directory.
#   docker build -t airfareindex-api backend
#   docker run --rm -p 8000:8000 -e AIRFARE_ENV=production -e AIRFARE_CORS_ORIGINS=https://your-frontend.example airfareindex-api
FROM python:3.14-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 PIP_DISABLE_PIP_VERSION_CHECK=1 \
    AIRFARE_ENV=production OMP_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1

WORKDIR /srv

# scikit-learn's OpenMP runtime
RUN apt-get update && apt-get install -y --no-install-recommends libgomp1 && rm -rf /var/lib/apt/lists/*

COPY requirements-prod.txt .
RUN pip install -r requirements-prod.txt

# Only what the API needs at runtime (see .dockerignore): code, the selected model, the supported-options file.
COPY app ./app
COPY ml ./ml
COPY saved_models/final ./saved_models/final
COPY data/processed/supported_options.json ./data/processed/supported_options.json

RUN useradd --system --uid 10001 airfare && chown -R airfare /srv
USER airfare

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD python -c "import os,urllib.request;urllib.request.urlopen('http://127.0.0.1:%s/ready' % os.environ.get('PORT','8000'),timeout=4)"

# One worker: the model is held in memory once; tree prediction is single-threaded per request by design.
CMD ["sh", "-c", "exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --workers 1 --proxy-headers --forwarded-allow-ips='*' --timeout-keep-alive 30 --limit-concurrency 64 --no-server-header"]
