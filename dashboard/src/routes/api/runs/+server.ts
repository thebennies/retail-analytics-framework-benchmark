import { json } from '@sveltejs/kit';
import { listRuns } from '$lib/db';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
  return json(listRuns());
};
