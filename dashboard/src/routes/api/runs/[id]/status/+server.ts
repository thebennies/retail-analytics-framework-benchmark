import { json } from '@sveltejs/kit';
import { getDb } from '$lib/db';
import { tailLogFile, latestProgress } from '$lib/server/progressParser';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params }) => {
  const runId = Number(params.id);
  const db = getDb();

  // Get active_runs row
  const active = db.prepare('SELECT * FROM active_runs WHERE run_id = ?').get(runId) as any;

  // Count results
  const countRow = db.prepare('SELECT COUNT(*) as cnt FROM benchmark_results WHERE run_id = ?').get(runId) as any;
  const resultsCount = countRow?.cnt ?? 0;

  // Get benchmark_run
  const run = db.prepare('SELECT * FROM benchmark_runs WHERE id = ?').get(runId) as any;

  let status = 'unknown';
  let progress = null;
  let lastLogLines: string[] = [];

  if (active) {
    status = active.status;
    if (active.log_path) {
      lastLogLines = tailLogFile(active.log_path, 20);
      progress = latestProgress(lastLogLines);
    }
    // Self-heal: if status is 'running' but PID is gone
    if (status === 'running' && active.pid) {
      try { process.kill(active.pid, 0); } catch {
        status = 'completed';
      }
    }
  } else if (run?.finished_at) {
    status = 'completed';
  }

  return json({
    run_id: runId,
    status,
    progress,
    latest_results_count: resultsCount,
    last_log_lines: lastLogLines,
    started_at: run?.started_at ?? null,
    finished_at: run?.finished_at ?? null,
  });
};
