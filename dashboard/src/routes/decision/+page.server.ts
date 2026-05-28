import { listRuns, getDb } from '$lib/db';
import { buildFrameworkRows } from '$lib/decision';
import { weightedScore, rank, DEFAULT_WEIGHTS, type Weights } from '$lib/scoring';

export async function load({ url }: { url: URL }) {
  const runs = listRuns();
  const runId = Number(url.searchParams.get('runId') || (runs[0]?.id ?? 0));
  const concurrency = Number(url.searchParams.get('concurrency') || '10');

  let scored: any[] = [];
  let rows: any[] = [];
  let recommended = '';

  try {
    rows = buildFrameworkRows(runId, concurrency);
    if (rows.length > 0) {
      const s = rank(weightedScore(rows, DEFAULT_WEIGHTS));
      scored = s.map(fw => ({
        framework: fw.framework,
        weighted_total: fw.weighted_total,
        dimensions: Object.fromEntries(
          Object.entries(fw.dimensions).map(([k, v]) => [k, { raw: (v as any).raw, score: (v as any).score }])
        ),
      }));
      recommended = scored[0]?.framework ?? '';
    }
  } catch {
    // db may be empty or run not found
  }

  // Get available concurrency levels for this run
  let concLevels: number[] = [];
  try {
    const db = getDb();
    const rows_ = db.prepare(
      'SELECT DISTINCT concurrency FROM benchmark_results WHERE run_id = ? ORDER BY concurrency'
    ).all(runId) as { concurrency: number }[];
    concLevels = rows_.map(r => r.concurrency);
  } catch {}

  return { runs, runId, concurrency, rows, scored, recommended, concLevels, defaultWeights: DEFAULT_WEIGHTS };
}
