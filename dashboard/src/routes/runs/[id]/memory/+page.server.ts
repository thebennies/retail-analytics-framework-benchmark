import { getDb, type BenchmarkResult } from '$lib/db';

export async function load({ params }: { params: { id: string } }) {
  const runId = Number(params.id);
  const db = getDb();
  const results = db.prepare(`
    SELECT * FROM benchmark_results
    WHERE run_id = ? AND peak_rss_mb IS NOT NULL
    ORDER BY framework, concurrency
  `).all(runId) as BenchmarkResult[];

  return { runId, results };
}
