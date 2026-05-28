import { json } from '@sveltejs/kit';
import { buildFrameworkRows, renderMemo } from '$lib/decision';
import { weightedScore, rank, DEFAULT_WEIGHTS } from '$lib/scoring';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, url }) => {
  const runId = Number(params.run_id);
  const concurrency = Number(url.searchParams.get('concurrency') || '10');

  try {
    const rows = buildFrameworkRows(runId, concurrency);
    const scored = rank(weightedScore(rows, DEFAULT_WEIGHTS));
    const memo = renderMemo(runId, concurrency, DEFAULT_WEIGHTS, rows, scored);

    return new Response(memo, {
      headers: {
        'Content-Type': 'text/markdown; charset=utf-8',
        'Content-Disposition': `attachment; filename="decision-memo-${runId}-${new Date().toISOString().slice(0, 10)}.md"`,
      },
    });
  } catch (e: any) {
    return json({ error: e.message }, { status: 500 });
  }
};
