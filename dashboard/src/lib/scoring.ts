/**
 * Pure scoring functions for Phase 3c decision framework.
 *
 * Six dimensions (per spec section 9):
 *   sustained_rps         (higher better, weight 25%)
 *   p99_ms                (lower  better, weight 20%)
 *   peak_rss_mb           (lower  better, weight 25%)
 *   stability_max_c       (higher better, weight 15%)
 *   memory_scaling        (lower  better, weight 10%)
 *   dev_experience_1to5   (manual 1-5,    weight  5%)
 */

export type Dimension =
  | 'sustained_rps'
  | 'p99_ms'
  | 'peak_rss_mb'
  | 'stability_max_c'
  | 'memory_scaling'
  | 'dev_experience';

export interface Weights {
  sustained_rps: number;
  p99_ms: number;
  peak_rss_mb: number;
  stability_max_c: number;
  memory_scaling: number;
  dev_experience: number;
}

export const DEFAULT_WEIGHTS: Weights = {
  sustained_rps: 25,
  p99_ms: 20,
  peak_rss_mb: 25,
  stability_max_c: 15,
  memory_scaling: 10,
  dev_experience: 5,
};

export const DIMENSION_LABELS: Record<Dimension, string> = {
  sustained_rps: 'Sustained RPS',
  p99_ms: 'p99 Latency (ms)',
  peak_rss_mb: 'Peak RSS (MB)',
  stability_max_c: 'Max Stable Concurrency',
  memory_scaling: 'Memory Scaling Ratio',
  dev_experience: 'Dev Experience (1-5)',
};

export interface FrameworkRow {
  framework: string;
  sustained_rps: number | null;
  p99_ms: number | null;
  peak_rss_mb: number | null;
  stability_max_c: number | null;
  memory_scaling: number | null;
  dev_experience: number | null;
}

export interface ScoredDimension {
  raw: number | null;
  score: number;
}

export interface ScoredFramework {
  framework: string;
  dimensions: Record<Dimension, ScoredDimension>;
  weighted_total: number;
}

export function weightsAreValid(w: Weights): boolean {
  const sum =
    w.sustained_rps + w.p99_ms + w.peak_rss_mb +
    w.stability_max_c + w.memory_scaling + w.dev_experience;
  return Math.abs(sum - 100) < 0.01;
}

export function normalizeHigherBetter(values: (number | null)[]): number[] {
  const finite = values.filter((v): v is number => v !== null && Number.isFinite(v) && v > 0);
  if (finite.length === 0) return values.map(() => 0);
  const max = Math.max(...finite);
  if (max <= 0) return values.map(() => 0);
  return values.map(v => (v === null || !Number.isFinite(v) || v <= 0 ? 0 : (v / max) * 100));
}

export function normalizeLowerBetter(values: (number | null)[]): number[] {
  const finite = values.filter((v): v is number => v !== null && Number.isFinite(v) && v > 0);
  if (finite.length === 0) return values.map(() => 0);
  const min = Math.min(...finite);
  if (min <= 0) return values.map(() => 0);
  return values.map(v => (v === null || !Number.isFinite(v) || v <= 0 ? 0 : (min / v) * 100));
}

export function normalizeDevExp(values: (number | null)[]): number[] {
  return values.map(v => {
    if (v === null || !Number.isFinite(v)) return 0;
    const clamped = Math.max(1, Math.min(5, v));
    return (clamped / 5) * 100;
  });
}

export function weightedScore(
  rows: FrameworkRow[],
  weights: Weights = DEFAULT_WEIGHTS,
): ScoredFramework[] {
  const rpsScores = normalizeHigherBetter(rows.map(r => r.sustained_rps));
  const p99Scores = normalizeLowerBetter(rows.map(r => r.p99_ms));
  const rssScores = normalizeLowerBetter(rows.map(r => r.peak_rss_mb));
  const stabilityScores = normalizeHigherBetter(rows.map(r => r.stability_max_c));
  const memScalingScores = normalizeLowerBetter(rows.map(r => r.memory_scaling));
  const devExpScores = normalizeDevExp(rows.map(r => r.dev_experience));

  const wTotal =
    weights.sustained_rps + weights.p99_ms + weights.peak_rss_mb +
    weights.stability_max_c + weights.memory_scaling + weights.dev_experience;
  const wDenom = wTotal > 0 ? wTotal : 100;

  return rows.map((r, i) => {
    const dimensions: Record<Dimension, ScoredDimension> = {
      sustained_rps: { raw: r.sustained_rps, score: rpsScores[i] },
      p99_ms: { raw: r.p99_ms, score: p99Scores[i] },
      peak_rss_mb: { raw: r.peak_rss_mb, score: rssScores[i] },
      stability_max_c: { raw: r.stability_max_c, score: stabilityScores[i] },
      memory_scaling: { raw: r.memory_scaling, score: memScalingScores[i] },
      dev_experience: { raw: r.dev_experience, score: devExpScores[i] },
    };
    const weighted_total =
      (rpsScores[i] * weights.sustained_rps +
       p99Scores[i] * weights.p99_ms +
       rssScores[i] * weights.peak_rss_mb +
       stabilityScores[i] * weights.stability_max_c +
       memScalingScores[i] * weights.memory_scaling +
       devExpScores[i] * weights.dev_experience) / wDenom;

    return { framework: r.framework, dimensions, weighted_total };
  });
}

export function rank(scored: ScoredFramework[]): ScoredFramework[] {
  return [...scored].sort((a, b) => {
    if (b.weighted_total !== a.weighted_total) return b.weighted_total - a.weighted_total;
    return a.framework.localeCompare(b.framework);
  });
}
