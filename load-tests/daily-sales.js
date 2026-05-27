import http from 'k6/http';
import { check } from 'k6';

const TARGET_URL = __ENV.TARGET_URL || 'http://localhost:8001';
const VUS = parseInt(__ENV.VUS || '10', 10);
const DURATION = __ENV.DURATION || '60s';
const WARMUP = __ENV.WARMUP || '10s';

export const options = {
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
    'http_req_failed{phase:measure}': ['rate<0.05'],
  },
  discardResponseBodies: false,
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(50)', 'p(95)', 'p(99)'],
};

export default function () {
  const res = http.get(`${TARGET_URL}/benchmark/daily-sales`);
  check(res, { 'status 200': (r) => r.status === 200 });
}
