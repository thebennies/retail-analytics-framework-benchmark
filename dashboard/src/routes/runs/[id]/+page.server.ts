import { getRun, getRunResults } from '$lib/db';
import type { BenchmarkResult, BenchmarkRun, HardwareRun } from '$lib/db';

export async function load({ params }: { params: { id: string } }) {
  const id = Number(params.id);
  const run = getRun(id);
  if (!run) throw new Error(`Run ${id} not found`);
  const results = getRunResults(id);
  return { run, results };
}
