/**
 * Fastify benchmark service — Phase 2b.
 * 4-worker Node.js cluster, each running Fastify 5 + pg.Pool(max=25).
 * Total connections to PgBouncer = 4 × 25 = 100 = default_pool_size.
 */
'use strict';

const cluster = require('cluster');
const path = require('path');
const crypto = require('crypto');

const WORKERS = parseInt(process.env.SERVICE_WORKERS || '4', 10);
const PORT = parseInt(process.env.FASTIFY_PORT || '8002', 10);
const POOL_MAX = parseInt(process.env.POOL_MAX || '25', 10);
const POOL_MIN = parseInt(process.env.POOL_MIN || '5', 10);

// Validate env vars (fixes M-36)
function parseEnvInt(name, val, min, max) {
  const n = parseInt(val, 10);
  if (!Number.isFinite(n) || n < min || n > max) {
    console.error(`[fastify] FATAL: ${name}=${val} must be an integer in [${min}, ${max}]`);
    process.exit(1);
  }
  return n;
}
const VALIDATED_WORKERS = parseEnvInt('SERVICE_WORKERS', process.env.SERVICE_WORKERS || '4', 1, 64);
const VALIDATED_PORT = parseEnvInt('FASTIFY_PORT', process.env.FASTIFY_PORT || '8002', 1, 65535);
const VALIDATED_POOL_MAX = parseEnvInt('POOL_MAX', process.env.POOL_MAX || '25', 1, 10000);
const VALIDATED_POOL_MIN = parseEnvInt('POOL_MIN', process.env.POOL_MIN || '5', 0, VALIDATED_POOL_MAX);

if (cluster.isPrimary) {
  console.log(`[fastify] primary pid=${process.pid} workers=${VALIDATED_WORKERS}`);
  const restartCounts = new Map();
  const MAX_RESTARTS = 10;
  const RESTART_WINDOW_MS = 60_000;

  for (let i = 0; i < VALIDATED_WORKERS; i++) cluster.fork();
  cluster.on('exit', (w, code) => {
    console.error(`[fastify] worker ${w.process.pid} exited code=${code}`);
    const now = Date.now();
    const restarts = restartCounts.get(w.id) || [];
    // Keep only restarts within the window
    const recent = restarts.filter(t => now - t < RESTART_WINDOW_MS);
    recent.push(now);
    restartCounts.set(w.id, recent);
    if (recent.length > MAX_RESTARTS) {
      console.error(`[fastify] worker ${w.id} exceeded ${MAX_RESTARTS} restarts in ${RESTART_WINDOW_MS / 1000}s — not reforking`);
    } else {
      cluster.fork();
    }
  });
} else {
  startWorker();
}

async function startWorker() {
  // ── pg type parser overrides (MUST be before Pool creation) ──
  const pg = require('pg');
  const types = pg.types;
  // INT8 / BIGINT (OID 20): parse as int to match FastAPI/Axum integer output
  types.setTypeParser(20, (val) => parseInt(val, 10));
  // INT4 (OID 23): ensure int
  types.setTypeParser(23, (val) => parseInt(val, 10));
  // INT2 (OID 21): ensure int
  types.setTypeParser(21, (val) => parseInt(val, 10));
  // NUMERIC (OID 1700): parse as float to match FastAPI Decimal→float / Axum BigDecimal→f64
  types.setTypeParser(1700, (val) => parseFloat(val));
  // DATE (OID 1082): keep as raw string 'YYYY-MM-DD'
  types.setTypeParser(1082, (val) => val);
  // TIMESTAMPTZ (OID 1184): keep as string
  types.setTypeParser(1184, (val) => val);
  // TIMESTAMP (OID 1114): keep as string
  types.setTypeParser(1114, (val) => val);

  const fastify = require('fastify')({ logger: false });

  // ── Pool ──
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    max: VALIDATED_POOL_MAX,
    min: VALIDATED_POOL_MIN,
    // No named prepared statements — PgBouncer transaction mode breaks them.
  });

  pool.on('error', (err) => console.error('[fastify] pool error', err.message));

  // ── Queries ──
  const { loadQueries } = require('./queries');
  const queriesPath = process.env.QUERIES_PATH || path.join(__dirname, '..', 'shared-queries.sql');
  const queries = loadQueries(queriesPath);
  console.log(`[fastify] worker pid=${process.pid} loaded ${queries.size} queries`);

  // ── Response helper ──
  function buildResponse(task, t0, q0, result) {
    return {
      framework: 'fastify',
      task,
      execution_time_ms: round3(performance.now() - t0),
      query_time_ms: round3(performance.now() - q0),
      rows_returned: Array.isArray(result) ? result.length : 1,
      result,
      timestamp: new Date().toISOString(),
      request_id: crypto.randomUUID(),
    };
  }

  function round3(ms) {
    return Math.round(ms * 1000) / 1000;
  }

  // ── Single-query runner ──
  async function runSingleQuery(task) {
    const t0 = performance.now();
    const sql = queries.get(task);
    if (!sql) {
      const err = new Error('query not found: ' + task);
      (err as any).statusCode = 404;
      throw err;
    }
    const q0 = performance.now();
    const { rows } = await pool.query(sql);
    return buildResponse(task, t0, q0, rows);
  }

  // ── Routes ──

  fastify.get('/health', async () => ({
    status: 'ok',
    framework: 'fastify',
    db_pool_size: POOL_MAX,
    db_pool_min: POOL_MIN,
  }));

  fastify.get('/benchmark/daily-sales', async () => runSingleQuery('daily-sales'));
  fastify.get('/benchmark/sales-by-location', async () => runSingleQuery('sales-by-location'));
  fastify.get('/benchmark/sales-by-product', async () => runSingleQuery('sales-by-product'));
  fastify.get('/benchmark/sales-by-payment', async () => runSingleQuery('sales-by-payment'));
  fastify.get('/benchmark/hourly-sales', async () => runSingleQuery('hourly-sales'));
  fastify.get('/benchmark/top-products', async () => runSingleQuery('top-products'));
  fastify.get('/benchmark/location-product-matrix', async () => runSingleQuery('location-product-matrix'));
  fastify.get('/benchmark/discount-impact', async () => runSingleQuery('discount-impact'));

  // /benchmark/full-summary — SEQUENTIAL (8 sub-queries via for-loop, NOT Promise.all)
  // Rationale: parallel fan-out at c=1000 creates 8000 in-flight queries,
  // contaminating cross-framework comparison.
  fastify.get('/benchmark/full-summary', async () => {
    const t0 = performance.now();
    const tasks = [
      'daily-sales', 'sales-by-location', 'sales-by-product', 'sales-by-payment',
      'hourly-sales', 'top-products', 'location-product-matrix', 'discount-impact',
    ];
    const subResults = {};
    let queryMsTotal = 0;

    for (const task of tasks) {
      const sql = queries.get(task);
      if (!sql) {
        const err = new Error('query not found: ' + task);
        (err as any).statusCode = 404;
        throw err;
      }
      const q0 = performance.now();
      const { rows } = await pool.query(sql);
      const qMs = performance.now() - q0;
      queryMsTotal += qMs;
      subResults[task] = {
        rows_returned: rows.length,
        query_time_ms: round3(qMs),
        result: rows,
      };
    }

    return {
      framework: 'fastify',
      task: 'full-summary',
      execution_time_ms: round3(performance.now() - t0),
      query_time_ms: round3(queryMsTotal),
      rows_returned: 1,
      result: subResults,
      timestamp: new Date().toISOString(),
      request_id: crypto.randomUUID(),
    };
  });

  // ── Start ──
  try {
    await fastify.listen({ port: VALIDATED_PORT, host: '0.0.0.0' });
    console.log(`[fastify] worker pid=${process.pid} listening :${VALIDATED_PORT}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}
