FROM python:3.12.4-slim-bookworm

WORKDIR /app

COPY pyproject.toml ./
RUN pip install --no-cache-dir .

COPY app ./app
COPY alembic.ini ./
COPY migrations ./migrations

# Cloud Run sends HTTP to the port in $PORT (8080); ECS and docker compose keep 8000.
# exec makes uvicorn PID 1, so SIGTERM on scale-down reaches it directly.
ENV PORT=8000
CMD ["sh", "-c", "alembic upgrade head && exec uvicorn app.main:app --host 0.0.0.0 --port \"$PORT\""]
