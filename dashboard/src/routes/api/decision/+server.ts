import { json } from '@sveltejs/kit';
import { getDb } from '$lib/db';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
  const body = await request.json();
  const { run_id, framework, dev_experience_score, notes } = body;

  if (!run_id || !framework || !dev_experience_score) {
    return json({ error: 'Missing required fields' }, { status: 400 });
  }

  if (dev_experience_score < 1 || dev_experience_score > 5) {
    return json({ error: 'dev_experience_score must be 1-5' }, { status: 400 });
  }

  const db = getDb(true);
  db.prepare(`
    INSERT INTO manual_scores (run_id, framework, dev_experience_score, notes)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(run_id, framework) DO UPDATE SET
      dev_experience_score = excluded.dev_experience_score,
      notes = excluded.notes,
      updated_at = CURRENT_TIMESTAMP
  `).run(run_id, framework, dev_experience_score, notes || null);

  return json({ ok: true });
};
