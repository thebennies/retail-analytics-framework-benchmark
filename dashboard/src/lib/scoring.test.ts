import { describe, it, expect } from 'vitest';
import {
  normalizeHigherBetter,
  normalizeLowerBetter,
  normalizeDevExp,
  weightedScore,
  rank,
  weightsAreValid,
  DEFAULT_WEIGHTS,
  type FrameworkRow,
} from './scoring';

describe('normalizeHigherBetter', () => {
  it('maps max to 100 and scales linearly', () => {
    const result = normalizeHigherBetter([100, 50, 25]);
    expect(result[0]).toBe(100);
    expect(result[1]).toBe(50);
    expect(result[2]).toBe(25);
  });

  it('returns all zero when all inputs are null/<=0', () => {
    expect(normalizeHigherBetter([null, 0, -3])).toEqual([0, 0, 0]);
  });
});

describe('normalizeLowerBetter', () => {
  it('maps min to 100 and scales inversely', () => {
    const result = normalizeLowerBetter([10, 20, 40]);
    expect(result[0]).toBe(100);
    expect(result[1]).toBe(50);
    expect(result[2]).toBe(25);
  });
});

describe('normalizeDevExp', () => {
  it('maps 5 to 100, 1 to 20, null to 0', () => {
    const result = normalizeDevExp([5, 3, 1, null]);
    expect(result[0]).toBe(100);
    expect(result[1]).toBe(60);
    expect(result[2]).toBe(20);
    expect(result[3]).toBe(0);
  });
});

describe('weightedScore', () => {
  it('produces ranked results', () => {
    const rows: FrameworkRow[] = [
      { framework: 'axum', sustained_rps: 10, p99_ms: 100, peak_rss_mb: 6, stability_max_c: 1000, memory_scaling: 1.0, dev_experience: 3 },
      { framework: 'fastapi', sustained_rps: 10, p99_ms: 100, peak_rss_mb: 29, stability_max_c: 1000, memory_scaling: 4.8, dev_experience: 5 },
      { framework: 'fastify', sustained_rps: 10, p99_ms: 100, peak_rss_mb: 52, stability_max_c: 1000, memory_scaling: 8.7, dev_experience: 4 },
    ];
    const scored = weightedScore(rows);
    const ranked_ = rank(scored);
    // Axum should win due to lowest RSS and memory scaling
    expect(ranked_[0].framework).toBe('axum');
    expect(ranked_.length).toBe(3);
  });
});

describe('weightsAreValid', () => {
  it('accepts defaults', () => {
    expect(weightsAreValid(DEFAULT_WEIGHTS)).toBe(true);
  });
  it('rejects non-100 sum', () => {
    expect(weightsAreValid({ ...DEFAULT_WEIGHTS, sustained_rps: 0 })).toBe(false);
  });
});
