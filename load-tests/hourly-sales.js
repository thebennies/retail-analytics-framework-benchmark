import http from 'k6/http';
import { check } from 'k6';
import { buildOptions } from './_shared-options.js';

const TARGET_URL = __ENV.TARGET_URL || 'http://localhost:8001';
const ENDPOINT_PATH = '/benchmark/hourly-sales';

export const options = buildOptions();

export default function () {
  const res = http.get(`${TARGET_URL}${ENDPOINT_PATH}`);
  check(res, { 'status 200': (r) => r.status === 200 });
}
