import { listHardware } from '$lib/db';

export async function load() {
  return { hardware: listHardware() };
}
