import { existsSync, readFileSync, writeFileSync, unlinkSync, mkdirSync, openSync, closeSync } from 'node:fs';
import { resolve } from 'node:path';
import { constants } from 'node:fs';

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

/**
 * Acquire lock atomically using O_EXCL (write with 'wx' flag).
 * Must be called before spawning to prevent race condition (M-32).
 * Returns the PID that will be used for the spawned child.
 */
export async function acquireRunLockAtomic(runId: number): Promise<number> {
  mkdirSync(LOCK_DIR, { recursive: true });

  // Clean stale locks first
  const existing = readLock();
  if (existing) {
    if (pidAlive(existing.pid)) {
      throw new Error(`Benchmark already running (pid=${existing.pid}, run_id=${existing.runId})`);
    }
    // Stale lock — clean up
    console.warn(`[runLock] cleaning stale lock for pid=${existing.pid}`);
    releaseRunLock();
  }

  // Generate a placeholder PID (will be updated by spawnRun)
  const placeholderPid = -1;

  try {
    // Atomic create with O_EXCL (fails if exists)
    const fd = openSync(LOCK_FILE, 'wx');
    const info: LockInfo = { pid: placeholderPid, runId, ts: new Date().toISOString() };
    writeFileSync(fd, JSON.stringify(info), 'utf8');
    closeSync(fd);

    // Return a fake PID; spawnRun will update it atomically
    return process.pid;
  } catch (err: any) {
    if (err.code === 'EEXIST') {
      throw new Error('Failed to acquire lock: concurrent spawn detected');
    }
    throw err;
  }
}

/**
 * Update the lock with the actual spawned child PID.
 * Called by spawnRun after successful spawn.
 */
export function updateLockPid(pid: number): void {
  const existing = readLock();
  if (!existing) {
    console.warn('[runLock] updateLockPid called with no lock');
    return;
  }
  const info: LockInfo = { pid, runId: existing.runId, ts: new Date().toISOString() };
  writeFileSync(LOCK_FILE, JSON.stringify(info), 'utf8');
}
