import { FRAMEWORKS, ENDPOINTS, CONCURRENCY_LEVELS } from '$lib/shared/runOptions';
import { readLock } from '$lib/server/runLock';

export async function load() {
  return {
    frameworks: [...FRAMEWORKS],
    endpoints: [...ENDPOINTS],
    concurrencyLevels: [...CONCURRENCY_LEVELS],
    activeRun: readLock(),
  };
}
