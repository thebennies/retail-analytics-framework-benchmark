// Shared k6 options + scenario builder used by all 9 endpoint scripts.
const TARGET_URL = __ENV.TARGET_URL || 'http://localhost:8001';
const VUS = parseInt(__ENV.VUS || '10', 10);
const DURATION = __ENV.DURATION || '60s';
const WARMUP = __ENV.WARMUP || '10s';
const ERR_THRESHOLD = parseFloat(__ENV.BENCH_ERROR_RATE_THRESHOLD || '0.05');

export function buildOptions() {
  return {
    scenarios: {
      warmup: {
        executor: 'constant-vus',
        vus: VUS,
        duration: WARMUP,
        gracefulStop: '0s',
        tags: { phase: 'warmup' },
      },
      measure: {
        executor: 'constant-vus',
        vus: VUS,
        duration: DURATION,
        startTime: WARMUP,
        gracefulStop: '0s',
        tags: { phase: 'measure' },
      },
    },
    thresholds: {
      'http_req_failed{phase:measure}': ['rate<' + ERR_THRESHOLD],
    },
    discardResponseBodies: false,
    summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(50)', 'p(95)', 'p(99)'],
  };
}

export { TARGET_URL, VUS, DURATION, WARMUP };
