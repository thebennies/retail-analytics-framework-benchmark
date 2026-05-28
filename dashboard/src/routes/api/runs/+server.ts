import { json } from '@sveltejs/kit';
import { listRuns } from '$lib/db';
import { spawnBenchmark } from '$lib/server/spawnRun';
import { validateRunInput, estimateDuration, type RunInput } from '$lib/shared/runOptions';
import { readLock } from '$lib/server/runLock';
import { getDb } from '$lib/db';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
  return json(listRuns());
};

export const POST: RequestHandler = async ({ request, url }) => {
  // Security: only allow from localhost
  const clientHost = request.headers.get('x-forwarded-for') || request.headers.get('host') || '';
  // SvelteKit adapter-node doesn't easily expose remote IP; for now trust all from same origin

  const body = await request.json();
  const input: RunInput = {
    frameworks: body.frameworks || [],
    endpoints: body.endpoints || [],
    concurrency: body.concurrency || [],
  };

  const validationError = validateRunInput(input);
  if (validationError) {
    return json({ error: validationError }, { status: 400 });
  }

  // Check lock
  const existing = readLock();
  if (existing) {
    return json({ error: `Benchmark already running (run_id=${existing.runId})` }, { status: 409 });
  }

  // Pre-allocate a benchmark_runs row
  const db = getDb(true);
  const hw = db.prepare('SELECT id FROM hardware_runs ORDER BY id DESC LIMIT 1').get() as any;
  const hardwareId = hw?.id ?? 1;
  const notes = `frameworks=${input.frameworks.join(',')} endpoints=${input.endpoints.join(',')} concurrency=${input.concurrency.join(',')}`;

  const info = db.prepare(`
    INSERT INTO benchmark_runs (hardware_id, started_at, notes)
    VALUES (?, CURRENT_TIMESTAMP, ?)
  `).run(hardwareId, notes);

  const runId = Number(info.lastInsertRowid);

  // Spawn
  try {
    const result = spawnBenchmark(input, runId);
    return json({ run_id: result.runId, pid: result.pid, log_path: result.logPath }, { status: 202 });
  } catch (e: any) {
    return json({ error: e.message }, { status: 500 });
  }
};
