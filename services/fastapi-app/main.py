"""FastAPI service — Phase 1a walking skeleton.

Endpoints:
  GET /health                        — liveness + pool size echo
  GET /benchmark/daily-sales         — single aggregation query, uniform response
"""
from __future__ import annotations

import os
import time
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone

import asyncpg
from fastapi import FastAPI

from queries import QUERIES

DATABASE_URL = os.environ["DATABASE_URL"]
POOL_MIN = int(os.environ.get("POOL_MIN", "5"))
POOL_MAX = int(os.environ.get("POOL_MAX", "25"))
FRAMEWORK = "fastapi"


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.pool = await asyncpg.create_pool(
        DATABASE_URL,
        min_size=POOL_MIN,
        max_size=POOL_MAX,
        statement_cache_size=0,  # REQUIRED for PgBouncer transaction pool mode
    )
    try:
        yield
    finally:
        await app.state.pool.close()


app = FastAPI(lifespan=lifespan)


def _utcnow_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="microseconds").replace("+00:00", "Z")


def _rows_to_jsonable(rows: list[asyncpg.Record]) -> list[dict]:
    """asyncpg Records → list[dict] with Decimal/Date coerced to JSON-safe types."""
    out: list[dict] = []
    for r in rows:
        d: dict = {}
        for k, v in r.items():
            if hasattr(v, "isoformat"):
                d[k] = v.isoformat()
            elif isinstance(v, (int, float, str, bool)) or v is None:
                d[k] = v
            else:
                # Decimal → float (sufficient for Phase 1a; Phase 1b adds proper handling)
                d[k] = float(v)
        out.append(d)
    return out


@app.get("/health")
async def health() -> dict:
    pool: asyncpg.Pool = app.state.pool
    return {
        "status": "ok",
        "framework": FRAMEWORK,
        "db_pool_size": pool.get_max_size(),
        "db_pool_min": pool.get_min_size(),
    }


@app.get("/benchmark/daily-sales")
async def daily_sales() -> dict:
    pool: asyncpg.Pool = app.state.pool
    sql = QUERIES["daily-sales"]
    req_id = str(uuid.uuid4())

    t0 = time.perf_counter()
    async with pool.acquire() as conn:
        q0 = time.perf_counter()
        rows = await conn.fetch(sql)
        q1 = time.perf_counter()
    result = _rows_to_jsonable(rows)
    t1 = time.perf_counter()

    return {
        "framework": FRAMEWORK,
        "task": "daily-sales",
        "execution_time_ms": round((t1 - t0) * 1000, 3),
        "query_time_ms": round((q1 - q0) * 1000, 3),
        "rows_returned": len(result),
        "result": result,
        "timestamp": _utcnow_iso(),
        "request_id": req_id,
    }
