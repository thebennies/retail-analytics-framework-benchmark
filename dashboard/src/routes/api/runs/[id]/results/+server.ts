import { json } from '@sveltejs/kit';
import { getRunResults } from '$lib/db';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params }) => {
  const id = Number(params.id);
  return json(getRunResults(id));
};
