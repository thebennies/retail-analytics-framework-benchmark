"""FastAPI service — Phase 1b full benchmark surface.

Endpoints (spec section 5):
  GET /health
  GET /benchmark/daily-sales
  GET /benchmark/sales-by-location
  GET /benchmark/sales-by-product
  GET /benchmark/sales-by-payment
  GET /benchmark/hourly-sales
  GET /benchmark/top-products
  GET /benchmark/location-product-matrix
  GET /benchmark/discount-impact
  GET /benchmark/full-summary    (sequential, NOT asyncio.gather)
"""
from __future__ import annotations

import os
import time
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from decimal import Decimal

import asyncpg
from fastapi import FastAPI

from queries import QUERIES

DATABASE_URL = os.environ["DATABASE_URL"]
POOL_MIN = int(os.environ.get("POOL_MIN", "5"))
POOL_MAX = int(os.environ.get("POOL_MAX", "25"))
FRAMEWORK = "fastapi"

ENDPOINT_TO_QUERY = {
    "daily-sales": "daily-sales",
    "sales-by-location": "sales-by-location",
    "sales-by-product": "sales-by-product",
    "sales-by-payment": "sales-by-payment",
    "hourly-sales": "hourly-sales",
    "top-products": "top-products",
    "location-product-matrix": "location-product-matrix",
    "discount-impact": "discount-impact",
}


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


def _coerce(v):
    if v is None:
        return None
    if isinstance(v, Decimal):
        return float(v)
    if hasattr(v, "isoformat"):
        return v.isoformat()
    if isinstance(v, (int, float, str, bool)):
        return v
    return str(v)


def _rows_to_jsonable(rows: list[asyncpg.Record]) -> list[dict]:
    return [{k: _coerce(v) for k, v in r.items()} for r in rows]


async def _run_query(pool: asyncpg.Pool, sql_text: str) -> tuple[list[dict], float]:
    """Acquire → fetch → release. Returns (rows, query_time_ms)."""
    async with pool.acquire() as conn:
        q0 = time.perf_counter()
        rows = await conn.fetch(sql_text)
        q1 = time.perf_counter()
    return _rows_to_jsonable(rows), round((q1 - q0) * 1000, 3)


def _envelope(task: str, exec_ms: float, query_ms: float,
              rows: list[dict] | dict, req_id: str) -> dict:
    return {
        "framework": FRAMEWORK,
        "task": task,
        "execution_time_ms": round(exec_ms, 3),
        "query_time_ms": query_ms,
        "rows_returned": len(rows) if isinstance(rows, list) else 1,
        "result": rows,
        "timestamp": _utcnow_iso(),
        "request_id": req_id,
    }


@app.get("/health")
async def health() -> dict:
    pool: asyncpg.Pool = app.state.pool
    workers = int(os.environ.get("SERVICE_WORKERS", 4))
    pool_max = pool.get_max_size()
    pool_min = pool.get_min_size()
    total_pool = workers * pool_max

    # Assert pool sum invariant (fixes M-28)
    if total_pool != 100:
        return {
            "status": "error",
            "framework": FRAMEWORK,
            "error": f"Pool configuration invalid: {workers} workers × pool_max={pool_max} = {total_pool}, expected 100",
            "uvicorn_workers": workers,
            "db_pool_min_per_worker": pool_min,
            "db_pool_max_per_worker": pool_max,
            "total_client_pool": total_pool,
        }

    return {
        "status": "ok",
        "framework": FRAMEWORK,
        "uvicorn_workers": workers,
        "db_pool_min_per_worker": pool_min,
        "db_pool_max_per_worker": pool_max,
        "total_client_pool": total_pool,
        "pgbouncer_pool_size_assertion": "PASS" if total_pool == 100 else "FAIL",
    }


# Bind one route per query via a factory so we don't duplicate boilerplate.
def _register_query_endpoint(path_name: str, query_key: str) -> None:
    sql_text = QUERIES[query_key]

    @app.get(f"/benchmark/{path_name}", name=f"benchmark_{path_name}")
    async def _handler():
        pool: asyncpg.Pool = app.state.pool
        req_id = str(uuid.uuid4())
        t0 = time.perf_counter()
        rows, q_ms = await _run_query(pool, sql_text)
        t1 = time.perf_counter()
        return _envelope(path_name, (t1 - t0) * 1000, q_ms, rows, req_id)


for _p, _q in ENDPOINT_TO_QUERY.items():
    _register_query_endpoint(_p, _q)


@app.get("/benchmark/full-summary")
async def full_summary() -> dict:
    """Run all 8 queries SEQUENTIALLY (spec section 5).

    DO NOT replace with asyncio.gather — that violates spec queueing semantics.
    See test_full_summary_sequential.py for the enforcement check.
    """
    pool: asyncpg.Pool = app.state.pool
    req_id = str(uuid.uuid4())
    t0 = time.perf_counter()
    sub_results: dict[str, dict] = {}
    total_query_ms = 0.0
    for path_name, query_key in ENDPOINT_TO_QUERY.items():
        sql_text = QUERIES[query_key]
        rows, q_ms = await _run_query(pool, sql_text)
        total_query_ms += q_ms
        sub_results[path_name] = {
            "rows_returned": len(rows),
            "query_time_ms": q_ms,
            "result": rows,
        }
    t1 = time.perf_counter()
    return _envelope(
        "full-summary",
        (t1 - t0) * 1000,
        round(total_query_ms, 3),
        sub_results,
        req_id,
    )
