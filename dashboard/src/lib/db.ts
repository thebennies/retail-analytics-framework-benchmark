import Database from 'better-sqlite3';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

export type HardwareRun = {
  id: number;
  detected_at: string;
  cpu_model: string | null;
  cpu_cores: number | null;
  cpu_threads: number | null;
  total_ram_mb: number | null;
  disk_type: string | null;
  kernel_version: string | null;
  ubuntu_version: string | null;
  docker_version: string | null;
  postgres_version: string | null;
  hypervisor: string | null;
  cgroup_version: string | null;
  notes: string | null;
};

export type BenchmarkRun = {
  id: number;
  hardware_id: number;
  started_at: string;
  finished_at: string | null;
  notes: string | null;
};

export type BenchmarkResult = {
  id: number;
  run_id: number;
  framework: string;
  endpoint: string;
  concurrency: number;
  duration_seconds: number;
  rps_sustained: number | null;
  p50_ms: number | null;
  p95_ms: number | null;
  p99_ms: number | null;
  error_rate_pct: number | null;
  total_requests: number | null;
  total_errors: number | null;
  peak_rss_mb: number | null;
  avg_rss_mb: number | null;
  peak_cpu_pct: number | null;
  k6_raw_path: string | null;
  rss_raw_path: string | null;
  created_at: string;
};

export type RunWithHardware = BenchmarkRun & {
  cpu_model: string | null;
  cpu_cores: number | null;
  total_ram_mb: number | null;
  result_count: number;
};

function resolveDbPath(): string {
  if (process.env.DB_PATH) {
    return resolve(process.env.DB_PATH);
  }
  return resolve(process.cwd(), 'results', 'results.db');
}

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;
  const path = resolveDbPath();
  if (!existsSync(path)) {
    throw new Error(
      `results.db not found at ${path}. Set DB_PATH env var or run a benchmark first.`
    );
  }
  _db = new Database(path, { readonly: true, fileMustExist: true });
  _db.pragma('query_only = ON');
  return _db;
}

// ---------- Query helpers ----------

export function listRuns(): RunWithHardware[] {
  const db = getDb();
  const sql = `
    SELECT
      r.id, r.hardware_id, r.started_at, r.finished_at, r.notes,
      h.cpu_model, h.cpu_cores, h.total_ram_mb,
      (SELECT COUNT(*) FROM benchmark_results br WHERE br.run_id = r.id) AS result_count
    FROM benchmark_runs r
    LEFT JOIN hardware_runs h ON h.id = r.hardware_id
    ORDER BY r.started_at DESC, r.id DESC
  `;
  return db.prepare(sql).all() as RunWithHardware[];
}

export function getRun(id: number): (BenchmarkRun & Partial<HardwareRun>) | null {
  const db = getDb();
  const row = db.prepare(`
    SELECT r.*, h.cpu_model, h.cpu_cores, h.cpu_threads, h.total_ram_mb,
           h.disk_type, h.kernel_version, h.ubuntu_version, h.postgres_version,
           h.hypervisor, h.cgroup_version
    FROM benchmark_runs r
    LEFT JOIN hardware_runs h ON h.id = r.hardware_id
    WHERE r.id = ?
  `).get(id);
  return (row as (BenchmarkRun & Partial<HardwareRun>) | undefined) ?? null;
}

export function getRunResults(runId: number): BenchmarkResult[] {
  const db = getDb();
  return db.prepare(`
    SELECT * FROM benchmark_results
    WHERE run_id = ?
    ORDER BY framework, endpoint, concurrency
  `).all(runId) as BenchmarkResult[];
}

export function listHardware(): (HardwareRun & { run_count: number })[] {
  const db = getDb();
  return db.prepare(`
    SELECT h.*,
      (SELECT COUNT(*) FROM benchmark_runs r WHERE r.hardware_id = h.id) AS run_count
    FROM hardware_runs h
    ORDER BY h.detected_at DESC, h.id DESC
  `).all() as (HardwareRun & { run_count: number })[];
}

export function listRunsForHardware(hardwareId: number): RunWithHardware[] {
  const db = getDb();
  return db.prepare(`
    SELECT
      r.id, r.hardware_id, r.started_at, r.finished_at, r.notes,
      h.cpu_model, h.cpu_cores, h.total_ram_mb,
      (SELECT COUNT(*) FROM benchmark_results br WHERE br.run_id = r.id) AS result_count
    FROM benchmark_runs r
    LEFT JOIN hardware_runs h ON h.id = r.hardware_id
    WHERE r.hardware_id = ?
    ORDER BY r.started_at DESC
  `).all(hardwareId) as RunWithHardware[];
}

export type CompareInput = {
  frameworks: string[];
  endpoint: string;
  runId?: number;
};

export type ComparePoint = {
  concurrency: number;
  rps_sustained: number | null;
  p50_ms: number | null;
  p95_ms: number | null;
  p99_ms: number | null;
  peak_rss_mb: number | null;
  error_rate_pct: number | null;
};

export type CompareSeries = {
  framework: string;
  points: ComparePoint[];
};

export function compareResults(input: CompareInput): CompareSeries[] {
  const db = getDb();
  const series: CompareSeries[] = [];
  let runIdClause = '';
  const params: (string | number)[] = [];

  if (input.runId !== undefined) {
    runIdClause = 'AND br.run_id = ?';
    params.push(input.runId);
  }

  for (const fw of input.frameworks) {
    const sql = `
      SELECT concurrency, rps_sustained, p50_ms, p95_ms, p99_ms,
             peak_rss_mb, error_rate_pct, run_id
      FROM benchmark_results br
      WHERE framework = ? AND endpoint = ? ${runIdClause}
      ORDER BY run_id DESC, concurrency ASC
    `;
    const rows = db.prepare(sql).all(fw, input.endpoint, ...params) as (ComparePoint & { run_id: number })[];

    let kept = rows;
    if (input.runId === undefined && rows.length > 0) {
      const latest = rows[0].run_id;
      kept = rows.filter((r) => r.run_id === latest);
    }
    const byC = new Map<number, (typeof kept)[number]>();
    for (const r of kept) if (!byC.has(r.concurrency)) byC.set(r.concurrency, r);
    const points = [...byC.values()]
      .sort((a, b) => a.concurrency - b.concurrency)
      .map(({ run_id: _runId, ...rest }) => rest);

    series.push({ framework: fw, points });
  }
  return series;
}
