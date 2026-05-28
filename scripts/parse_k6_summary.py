#!/usr/bin/env python3
"""Parse k6 --summary-export JSON + RSS CSV into benchmark_results row.

Extracted from run-benchmark.sh inline Python for testability (fixes M-42).
"""
import csv
import json
import sqlite3
import sys
from pathlib import Path


def parse_k6_summary(
    summary_path: str,
    rss_path: str,
    duration_s: int,
    warmup_s: int,
) -> dict:
    """Parse k6 summary-export JSON and RSS CSV into a result dict.

    Returns dict with keys matching benchmark_results columns.
    Raises ValueError if measure-phase submetrics are missing.
    """
    with open(summary_path) as f:
        s = json.load(f)

    metrics = s.get("metrics", {})

    # We REQUIRE measure-tagged submetrics for fair comparison.
    http_reqs_measure = metrics.get("http_reqs{phase:measure}", {})
    http_req_duration_measure = metrics.get("http_req_duration{phase:measure}", {})
    http_req_failed_measure = metrics.get("http_req_failed{phase:measure}", {})

    # Fail loudly if measure-tagged submetrics are missing
    if not http_reqs_measure or not http_req_duration_measure:
        raise ValueError(
            "measure-phase submetrics not found. "
            "k6 thresholds may be misconfigured."
        )

    # Use only measure-phase data
    measure_count = int(http_reqs_measure.get("count", 0))
    if measure_count == 0:
        raise ValueError("no requests in measure phase")

    # RPS computed from measure-phase count and duration
    rps = measure_count / float(duration_s)
    fail_fraction = http_req_failed_measure.get("value", 0.0)
    total_errors = int(round(fail_fraction * measure_count))
    error_rate_pct = round(fail_fraction * 100, 4)

    # Use measure-tagged duration percentiles
    p50 = http_req_duration_measure.get("med", None)
    p95 = http_req_duration_measure.get("p(95)", None)
    p99 = http_req_duration_measure.get("p(99)", None)

    # RSS CSV: skip first warmup_s seconds for AVG.
    peak_rss_mb = None
    avg_rss_mb = None
    peak_cpu_pct = None
    try:
        with open(rss_path) as f:
            rd = csv.DictReader(f)
            rows = list(rd)
        if rows:
            first_ts = int(rows[0]["ts_epoch"])
            cutoff = first_ts + int(warmup_s)
            rss_vals = []
            cpu_vals = []
            for r in rows:
                ts = int(r["ts_epoch"])
                rss_kb = int(r["rss_kb"])
                cpu = float(r["cpu_pct"])
                if ts >= cutoff:
                    rss_vals.append(rss_kb)
                cpu_vals.append(cpu)
            peak_rss_mb = max(int(r["rss_kb"]) for r in rows) / 1024.0
            avg_rss_mb = (sum(rss_vals) / len(rss_vals) / 1024.0) if rss_vals else None
            peak_cpu_pct = max(cpu_vals) if cpu_vals else None
    except Exception:
        pass

    return {
        "rps_sustained": rps,
        "p50_ms": p50,
        "p95_ms": p95,
        "p99_ms": p99,
        "error_rate_pct": error_rate_pct,
        "total_requests": measure_count,
        "total_errors": total_errors,
        "peak_rss_mb": peak_rss_mb,
        "avg_rss_mb": avg_rss_mb,
        "peak_cpu_pct": peak_cpu_pct,
    }


def insert_result(db_path: str, run_id: int, framework: str, endpoint: str,
                  concurrency: int, duration_s: int, result: dict,
                  summary_path: str, rss_path: str) -> None:
    """Insert a parsed result into benchmark_results."""
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    cur.execute("""
    INSERT INTO benchmark_results
      (run_id, framework, endpoint, concurrency, duration_seconds,
       rps_sustained, p50_ms, p95_ms, p99_ms,
       error_rate_pct, total_requests, total_errors,
       peak_rss_mb, avg_rss_mb, peak_cpu_pct,
       k6_raw_path, rss_raw_path)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        int(run_id), framework, endpoint, int(concurrency), int(duration_s),
        result["rps_sustained"], result["p50_ms"], result["p95_ms"], result["p99_ms"],
        result["error_rate_pct"], result["total_requests"], result["total_errors"],
        result["peak_rss_mb"], result["avg_rss_mb"], result["peak_cpu_pct"],
        summary_path, rss_path,
    ))
    conn.commit()
    conn.close()


if __name__ == "__main__":
    if len(sys.argv) < 6:
        print("Usage: parse_k6_summary.py <summary.json> <rss.csv> <db> <run_id> <fw> <ep> <cc> <dur> <warmup>")
        sys.exit(1)
    (
        _summary_path, _rss_path, _db_path, _run_id, _framework,
        _endpoint, _concurrency, _duration_s, _warmup_s,
    ) = sys.argv[1:]

    _result = parse_k6_summary(_summary_path, _rss_path, int(_duration_s), int(_warmup_s))
    insert_result(
        _db_path, int(_run_id), _framework, _endpoint,
        int(_concurrency), int(_duration_s), _result,
        _summary_path, _rss_path,
    )
    print(
        f"[parse] inserted result rps={_result['rps_sustained']:.1f} "
        f"p99={_result['p99_ms']} err={_result['error_rate_pct']:.2f}% "
        f"peak_rss={_result['peak_rss_mb']}"
    )
