// Shared constants for benchmark run options.

export const FRAMEWORKS = ['fastapi', 'fastify', 'axum'] as const;
export const ENDPOINTS = [
  'daily-sales', 'sales-by-location', 'sales-by-product', 'sales-by-payment',
  'hourly-sales', 'top-products', 'location-product-matrix', 'discount-impact', 'full-summary',
] as const;
export const CONCURRENCY_LEVELS = [10, 50, 100, 500, 1000, 5000, 10000] as const;

export type RunInput = {
  frameworks: string[];
  endpoints: string[];
  concurrency: number[];
};

// ~85s per (framework, endpoint, concurrency) combo: warmup 10s + measure 60s + cooldown 15s.
const PER_LEVEL_SECONDS = 85;

export function estimateDuration(input: RunInput): number {
  return input.frameworks.length * input.endpoints.length * input.concurrency.length * PER_LEVEL_SECONDS;
}

export function validateRunInput(input: Partial<RunInput>): string | null {
  if (!input.frameworks?.length) return 'At least one framework required';
  if (!input.endpoints?.length) return 'At least one endpoint required';
  if (!input.concurrency?.length) return 'At least one concurrency level required';
  for (const fw of input.frameworks) {
    if (!FRAMEWORKS.includes(fw as any)) return `Unknown framework: ${fw}`;
  }
  for (const ep of input.endpoints) {
    if (!ENDPOINTS.includes(ep as any)) return `Unknown endpoint: ${ep}`;
  }
  for (const c of input.concurrency) {
    if (typeof c !== 'number' || c < 1 || c > 100000) return `Invalid concurrency: ${c}`;
  }
  return null;
}
