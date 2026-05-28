import { getDb } from '$lib/db';
import { tailLogFile, latestProgress } from '$lib/server/progressParser';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, request }) => {
  const runId = Number(params.id);

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      let lastCount = -1;

      const interval = setInterval(() => {
        try {
          const db = getDb();
          const active = db.prepare('SELECT * FROM active_runs WHERE run_id = ?').get(runId) as any;
          const countRow = db.prepare('SELECT COUNT(*) as cnt FROM benchmark_results WHERE run_id = ?').get(runId) as any;
          const count = countRow?.cnt ?? 0;

          let status = 'unknown';
          let progress = null;
          let logLines: string[] = [];

          if (active) {
            status = active.status;
            if (active.log_path) {
              logLines = tailLogFile(active.log_path, 5);
              progress = latestProgress(logLines);
            }
          } else {
            const run = db.prepare('SELECT finished_at FROM benchmark_runs WHERE id = ?').get(runId) as any;
            if (run?.finished_at) status = 'completed';
          }

          const event = {
            status,
            progress,
            results_count: count,
            last_log: logLines[logLines.length - 1] ?? '',
          };

          // Only send if something changed
          if (count !== lastCount || status === 'completed' || status === 'failed') {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
            lastCount = count;
          }

          if (status === 'completed' || status === 'failed') {
            clearInterval(interval);
            controller.close();
          }
        } catch (e) {
          // Keep going on error
        }
      }, 2000);

      // Cleanup on abort
      const abortHandler = () => {
        clearInterval(interval);
        try { controller.close(); } catch {}
      };
      // Note: request.signal may not be available in all adapters
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
};
