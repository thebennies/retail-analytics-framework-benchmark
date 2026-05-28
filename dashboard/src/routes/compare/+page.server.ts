import { compareResults, listRuns } from '$lib/db';
import type { CompareSeries, RunWithHardware } from '$lib/db';

const ALL_ENDPOINTS = [
  'daily-sales', 'sales-by-location', 'sales-by-product', 'sales-by-payment',
  'hourly-sales', 'top-products', 'location-product-matrix', 'discount-impact', 'full-summary'
];
const ALL_FRAMEWORKS = ['fastapi', 'fastify', 'axum'];

export async function load({ url }: { url: URL }) {
  const endpoint = url.searchParams.get('endpoint') || 'daily-sales';
  const frameworksParam = url.searchParams.get('frameworks') || ALL_FRAMEWORKS.join(',');
  const frameworks = frameworksParam.split(',').filter((f) => ALL_FRAMEWORKS.includes(f));
  const runIdStr = url.searchParams.get('runId');
  const runId = runIdStr ? Number(runIdStr) : undefined;

  let series: CompareSeries[] = [];
  try {
    series = compareResults({ frameworks, endpoint, runId });
  } catch {
    // db may be empty
  }

  const runs: RunWithHardware[] = listRuns();

  return {
    endpoint,
    frameworks,
    series,
    endpoints: ALL_ENDPOINTS,
    allFrameworks: ALL_FRAMEWORKS,
    runs,
    runId,
  };
}
