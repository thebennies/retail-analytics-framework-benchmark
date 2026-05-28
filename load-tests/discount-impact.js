import http from 'k6/http';
import { check } from 'k6';
import { buildOptions, TARGET_URL } from './_shared-options.js';

const ENDPOINT_PATH = '/benchmark/discount-impact';

export const options = buildOptions();

export default function () {
  const res = http.get(`${TARGET_URL}${ENDPOINT_PATH}`);
  check(res, { 'status 200': (r) => r.status === 200 });
}
