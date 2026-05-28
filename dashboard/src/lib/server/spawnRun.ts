import { spawn } from 'node:child_process';
import { createWriteStream, mkdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { getDb } from '$lib/db';
import { readLock, updateLockPid, releaseRunLock } from './runLock';
import type { RunInput } from '$lib/shared/runOptions';

export type SpawnResult = {
  runId: number;
  pid: number;
  logPath: string;
};

export function spawnBenchmark(input: RunInput, preallocatedRunId: number): SpawnResult {
  const rawDir = resolve(process.cwd(), 'results', 'raw');
  mkdirSync(rawDir, { recursive: true });

  const logPath = resolve(rawDir, `run-${preallocatedRunId}.log`);

  // Build args
  const args = [
    resolve(process.cwd(), 'scripts', 'run-benchmark.sh'),
    '--run-id', String(preallocatedRunId),
    '--frameworks', input.frameworks.join(','),
    '--endpoints', input.endpoints.join(','),
    '--concurrency', input.concurrency.join(','),
  ];

  const logStream = createWriteStream(logPath, { flags: 'w' });

  const child = spawn('bash', args, {
    cwd: process.cwd(),
    env: { ...process.env },
    detached: false,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  child.stdout.pipe(logStream);
  child.stderr.pipe(logStream);

  const pid = child.pid!;

  // Update lock with actual PID (caller already acquired it atomically)
  updateLockPid(pid);

  // Insert active_runs row
  const db = getDb(true);
  db.prepare(`
    INSERT INTO active_runs (run_id, pid, log_path, input_json, status, started_at)
    VALUES (?, ?, ?, ?, 'running', CURRENT_TIMESTAMP)
  `).run(preallocatedRunId, pid, logPath, JSON.stringify(input));

  child.on('exit', (code) => {
    const status = code === 0 ? 'completed' : 'failed';
    try {
      const db2 = getDb(true);
      db2.prepare(`UPDATE active_runs SET status = ?, finished_at = CURRENT_TIMESTAMP, exit_code = ? WHERE run_id = ?`)
        .run(status, code ?? -1, preallocatedRunId);
      db2.prepare(`UPDATE benchmark_runs SET finished_at = CURRENT_TIMESTAMP WHERE id = ?`)
        .run(preallocatedRunId);
    } catch (e) {
      console.error('[spawnRun] error updating status:', e);
    }
    releaseRunLock();
  });

  return { runId: preallocatedRunId, pid, logPath };
}
