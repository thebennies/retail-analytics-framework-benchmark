import { listRuns } from '$lib/db';
import type { RunWithHardware } from '$lib/db';

export async function load(): Promise<{ runs: RunWithHardware[] }> {
  return { runs: listRuns() };
}
