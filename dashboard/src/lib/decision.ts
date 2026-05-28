/**
 * Decision lib — assembles framework rows from DB, renders memo template.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { getDb, type BenchmarkResult } from '$lib/db';
import {
  weightedScore, rank, DEFAULT_WEIGHTS, weightsAreValid,
  type Weights, type FrameworkRow, type ScoredFramework,
} from './scoring';

export function buildFrameworkRows(runId: number, concurrency: number): FrameworkRow[] {
  const db = getDb();
  const results = db.prepare(`
    SELECT * FROM benchmark_results
    WHERE run_id = ? AND concurrency = ?
    ORDER BY framework
  `).all(runId, concurrency) as BenchmarkResult[];

  // Get manual scores
  const manualScores = db.prepare(`
    SELECT framework, dev_experience_score FROM manual_scores WHERE run_id = ?
  `).all(runId) as { framework: string; dev_experience_score: number }[];
  const scoreMap = new Map(manualScores.map(s => [s.framework, s.dev_experience_score]));

  // Aggregate per framework across endpoints
  const byFw = new Map<string, BenchmarkResult[]>();
  for (const r of results) {
    const list = byFw.get(r.framework) ?? [];
    list.push(r);
    byFw.set(r.framework, list);
  }

  // Get all concurrencies for each framework to compute stability_max_c
  const allResults = db.prepare(`
    SELECT framework, concurrency, error_rate_pct FROM benchmark_results
    WHERE run_id = ? ORDER BY framework, concurrency
  `).all(runId) as { framework: string; concurrency: number; error_rate_pct: number | null }[];

  // Read error rate threshold from environment (same as BENCH_ERROR_RATE_THRESHOLD in run-benchmark.sh)
  const errThresholdPct = parseFloat(process.env.BENCH_ERROR_RATE_THRESHOLD || '0.05') * 100;

  const stabilityMap = new Map<string, number>();
  for (const [fw, rows] of Object.entries(
    Object.groupBy(allResults, r => r.framework)
  )) {
    const maxStable = (rows ?? [])
      .filter(r => (r.error_rate_pct ?? 0) <= errThresholdPct)
      .sort((a, b) => b.concurrency - a.concurrency)[0]?.concurrency ?? 0;
    stabilityMap.set(fw, maxStable);
  }

  // Memory scaling: ratio of RSS at highest concurrency vs lowest (fixes M-07)
  // Scope to the same endpoint to avoid cross-endpoint noise
  const memScalingMap = new Map<string, number | null>();
  for (const [fw, rows] of byFw) {
    const allFwResults = db.prepare(`
      SELECT concurrency, peak_rss_mb FROM benchmark_results
      WHERE run_id = ? AND framework = ? AND peak_rss_mb IS NOT NULL
      ORDER BY concurrency
    `).all(runId, fw) as { concurrency: number; peak_rss_mb: number }[];
    if (allFwResults.length >= 2) {
      // Aggregate average RSS per concurrency level first
      const byCc = new Map<number, number[]>();
      for (const r of allFwResults) {
        const list = byCc.get(r.concurrency) ?? [];
        list.push(r.peak_rss_mb);
        byCc.set(r.concurrency, list);
      }
      const avgByCc = [...byCc.entries()]
        .sort(([a], [b]) => a - b)
        .map(([_, vals]) => vals.reduce((s, v) => s + v, 0) / vals.length);
      const rssLow = avgByCc[0];
      const rssHigh = avgByCc[avgByCc.length - 1];
      memScalingMap.set(fw, rssLow > 0 ? rssHigh / rssLow : null);
    } else {
      memScalingMap.set(fw, null);
    }
  }

  return [...byFw.keys()].sort().map(fw => {
    const fwResults = byFw.get(fw) ?? [];
    // Use average RPS and p99 across endpoints
    const avgRps = fwResults.reduce((s, r) => s + (r.rps_sustained ?? 0), 0) / (fwResults.length || 1);
    const avgP99 = fwResults.reduce((s, r) => s + (r.p99_ms ?? 0), 0) / (fwResults.length || 1);
    const maxRss = Math.max(...fwResults.map(r => r.peak_rss_mb ?? 0));

    return {
      framework: fw,
      sustained_rps: avgRps || null,
      p99_ms: avgP99 || null,
      peak_rss_mb: maxRss || null,
      stability_max_c: stabilityMap.get(fw) ?? 0,
      memory_scaling: memScalingMap.get(fw) ?? null,
      dev_experience: scoreMap.get(fw) ?? null,
    };
  });
}

export function renderMemo(
  runId: number,
  concurrency: number,
  weights: Weights,
  rows: FrameworkRow[],
  scored: ScoredFramework[],
): string {
  const db = getDb();
  const run = db.prepare(`
    SELECT r.*, h.cpu_model, h.cpu_cores, h.cpu_threads, h.total_ram_mb,
           h.disk_type, h.kernel_version, h.ubuntu_version, h.docker_version,
           h.postgres_version, h.hypervisor, h.cgroup_version
    FROM benchmark_runs r LEFT JOIN hardware_runs h ON h.id = r.hardware_id
    WHERE r.id = ?
  `).get(runId) as any;

  const ranked_ = rank(scored);
  const recommended = ranked_[0]?.framework ?? 'N/A';

  // Build pareto table
  const header = '| Framework | RPS | p99 (ms) | Peak RSS (MB) | Max Stable c | Mem Scaling |';
  const sep = '|---|---|---|---|---|---|';
  const paretoRows = rows.map(r =>
    `| ${r.framework} | ${r.sustained_rps?.toFixed(1) ?? '—'} | ${r.p99_ms?.toFixed(0) ?? '—'} | ${r.peak_rss_mb?.toFixed(1) ?? '—'} | ${r.stability_max_c ?? '—'} | ${r.memory_scaling?.toFixed(2) ?? '—'} |`
  ).join('\n');
  const paretoTable = [header, sep, ...paretoRows].join('\n');

  // Weights table
  const weightsTable = [
    '| Dimension | Weight |',
    '|---|---|',
    `| Sustained RPS | ${weights.sustained_rps}% |`,
    `| p99 Latency | ${weights.p99_ms}% |`,
    `| Peak RSS | ${weights.peak_rss_mb}% |`,
    `| Max Stable Concurrency | ${weights.stability_max_c}% |`,
    `| Memory Scaling | ${weights.memory_scaling}% |`,
    `| Dev Experience | ${weights.dev_experience}% |`,
  ].join('\n');

  // Weighted scores table
  const scoreHeader = '| Framework | RPS Score | p99 Score | RSS Score | Stability | Scaling | DevExp | **Total** |';
  const scoreSep = '|---|---|---|---|---|---|---|---|';
  const scoreRows = ranked_.map(s => {
    const d = s.dimensions;
    return `| **${s.framework}** | ${d.sustained_rps.score.toFixed(1)} | ${d.p99_ms.score.toFixed(1)} | ${d.peak_rss_mb.score.toFixed(1)} | ${d.stability_max_c.score.toFixed(1)} | ${d.memory_scaling.score.toFixed(1)} | ${d.dev_experience.score.toFixed(1)} | **${s.weighted_total.toFixed(1)}** |`;
  }).join('\n');
  const weightedScoresTable = [scoreHeader, scoreSep, ...scoreRows].join('\n');

  // Rationale
  const top = ranked_[0];
  const second = ranked_[1];
  let rationale = `**${recommended}** ranks first with a weighted score of ${top?.weighted_total.toFixed(1) ?? 'N/A'}/100.`;
  if (second) {
    rationale += ` It leads ${second.framework} (score ${second.weighted_total.toFixed(1)}) by ${(top!.weighted_total - second.weighted_total).toFixed(1)} points.`;
  }
  const topDims = top?.dimensions;
  if (topDims) {
    const best = Object.entries(topDims).filter(([_, v]) => v.score === 100).map(([k]) => k);
    if (best.length > 0) rationale += ` Best-in-class on: ${best.join(', ')}.`;
  }

  let template = '';
  try {
    template = readFileSync(resolve(process.cwd(), 'docs', 'DECISION_TEMPLATE.md'), 'utf8');
  } catch {
    template = readFileSync(resolve(process.cwd(), '..', 'docs', 'DECISION_TEMPLATE.md'), 'utf8');
  }

  const replace = (t: string, key: string, val: string) =>
    t.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), () => val);

  let memo = template;
  memo = replace(memo, 'run_id', String(runId));
  memo = replace(memo, 'concurrency_level', String(concurrency));
  memo = replace(memo, 'exported_at', new Date().toISOString());
  memo = replace(memo, 'cpu_model', run?.cpu_model ?? 'N/A');
  memo = replace(memo, 'cpu_cores', String(run?.cpu_cores ?? 'N/A'));
  memo = replace(memo, 'cpu_threads', String(run?.cpu_threads ?? 'N/A'));
  memo = replace(memo, 'total_ram_mb', String(run?.total_ram_mb ?? 'N/A'));
  memo = replace(memo, 'disk_type', run?.disk_type ?? 'N/A');
  memo = replace(memo, 'kernel_version', run?.kernel_version ?? 'N/A');
  memo = replace(memo, 'ubuntu_version', run?.ubuntu_version ?? 'N/A');
  memo = replace(memo, 'docker_version', run?.docker_version ?? 'N/A');
  memo = replace(memo, 'postgres_version', run?.postgres_version ?? 'N/A');
  memo = replace(memo, 'hypervisor', run?.hypervisor ?? 'N/A');
  memo = replace(memo, 'cgroup_version', run?.cgroup_version ?? 'N/A');
  memo = replace(memo, 'pareto_table', paretoTable);
  memo = replace(memo, 'weights_table', weightsTable);
  memo = replace(memo, 'weighted_scores', weightedScoresTable);
  memo = replace(memo, 'recommended_framework', recommended);
  memo = replace(memo, 'rationale', rationale);

  return memo;
}
