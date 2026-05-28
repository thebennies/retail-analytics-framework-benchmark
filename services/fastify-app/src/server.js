/**
 * Fastify benchmark service — Phase 2b.
 * 4-worker Node.js cluster, each running Fastify 5 + pg.Pool(max=25).
 * Total connections to PgBouncer = 4 × 25 = 100 = default_pool_size.
 */
'use strict';

const cluster = require('cluster');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const WORKERS = parseInt(process.env.SERVICE_WORKERS || '4', 10);
const PORT = parseInt(process.env.FASTIFY_PORT || '8002', 10);
const POOL_MAX = parseInt(process.env.POOL_MAX || '25', 10);
const POOL_MIN = parseInt(process.env.POOL_MIN || '5', 10);

if (cluster.isPrimary) {
  console.log(`[fastify] primary pid=${process.pid} workers=${WORKERS}`);
  for (let i = 0; i < WORKERS; i++) cluster.fork();
  cluster.on('exit', (w, code) => {
    console.error(`[fastify] worker ${w.process.pid} exited code=${code}`);
    cluster.fork();
  });
} else {
  startWorker();
}

async function startWorker() {
  const fastify = require('fastify')({ logger: false });

  // ── pg type parser overrides ──
  // NUMERIC (OID 1700): parse as float to match FastAPI Decimal→float / Axum BigDecimal→f64
  const { types } = require('pg');
  types.setTypeParser(1700, (val) => parseFloat(val));
  // DATE (OID 1082): keep as raw string 'YYYY-MM-DD' (node-postgres would parse to JS Date in local TZ)
  types.setTypeParser(1082, (val) => val);
  // TIMESTAMPTZ (OID 1184): keep as string — already ISO with Z
  types.setTypeParser(1184, (val) => val);
  // TIMESTAMP (OID 1114): keep as string
  types.setTypeParser(1114, (val) => val);

  // ── Pool ──
  const { Pool } = require('pg');
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: POOL_MAX,
    min: POOL_MIN,
    // No named prepared statements — PgBouncer transaction mode breaks them.
    // pg Pool.query() defaults to unnamed prepared statements which work fine.
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
    if (!sql) throw fastify.httpErrors.notFound('query not found: ' + task);
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
      if (!sql) throw fastify.httpErrors.notFound('query not found: ' + task);
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
    await fastify.listen({ port: PORT, host: '0.0.0.0' });
    console.log(`[fastify] worker pid=${process.pid} listening :${PORT}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}
