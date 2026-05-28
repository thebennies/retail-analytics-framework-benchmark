import { json } from '@sveltejs/kit';
import { compareResults } from '$lib/db';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
  const frameworks = (url.searchParams.get('frameworks') || 'fastapi,fastify,axum').split(',');
  const endpoint = url.searchParams.get('endpoint') || 'daily-sales';
  const runIdStr = url.searchParams.get('runId');
  const runId = runIdStr ? Number(runIdStr) : undefined;

  return json(compareResults({ frameworks, endpoint, runId }));
};
