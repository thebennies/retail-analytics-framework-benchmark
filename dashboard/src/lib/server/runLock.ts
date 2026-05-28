import { existsSync, readFileSync, writeFileSync, unlinkSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const LOCK_DIR = 'results';
const LOCK_FILE = resolve(LOCK_DIR, '.run-lock');

export type LockInfo = {
  pid: number;
  runId: number;
  ts: string;
};

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function readLock(): LockInfo | null {
  if (!existsSync(LOCK_FILE)) return null;
  try {
    const data = readFileSync(LOCK_FILE, 'utf8');
    return JSON.parse(data) as LockInfo;
  } catch {
    return null;
  }
}

export function acquireRunLock(pid: number, runId: number): void {
  mkdirSync(LOCK_DIR, { recursive: true });
  const existing = readLock();
  if (existing) {
    if (pidAlive(existing.pid)) {
      throw new Error(`Benchmark already running (pid=${existing.pid}, run_id=${existing.runId})`);
    }
    // Stale lock — clean up.
    console.warn(`[runLock] cleaning stale lock for pid=${existing.pid}`);
    releaseRunLock();
  }
  const info: LockInfo = { pid, runId, ts: new Date().toISOString() };
  writeFileSync(LOCK_FILE, JSON.stringify(info), 'utf8');
}

export function releaseRunLock(): void {
  try { unlinkSync(LOCK_FILE); } catch { /* already gone */ }
}
