FROM python:3.12-slim

WORKDIR /app

# System deps for asyncpg + uvloop builds (slim image lacks them)
RUN apt-get update && apt-get install -y --no-install-recommends \
      build-essential \
      libpq-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY queries.py main.py ./

# Mount shared queries.sql at runtime (volume) OR bake in. Phase 1a: bake.
COPY shared-queries.sql /app/shared-queries.sql

ENV PYTHONUNBUFFERED=1

EXPOSE 8001

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8001", \
     "--workers", "4", \
     "--loop", "uvloop", \
     "--http", "httptools", \
     "--no-access-log"]
