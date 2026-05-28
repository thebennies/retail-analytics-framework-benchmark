"""Tests for parse_k6_summary — the k6-summary parser (fixes M-42).

Uses a captured k6 --summary-export fixture to verify the parser:
1. Correctly extracts measure-phase metrics (not warmup-contaminated)
2. Fails loudly when measure-phase submetrics are absent
3. Computes RPS from measure count / duration (not aggregate rate)
4. Handles RSS CSV with warmup exclusion
"""
import json
import os
import tempfile

import pytest

# Add parent dir to path so we can import the parser
import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from parse_k6_summary import parse_k6_summary


def _make_summary(
    *,
    measure_count: int = 60000,
    measure_rate: float = 1000.0,
    measure_med: float = 5.0,
    measure_p95: float = 20.0,
    measure_p99: float = 50.0,
    fail_rate: float = 0.001,
    warmup_count: int = 10000,
    warmup_rate: float = 1000.0,
    warmup_med: float = 8.0,
    warmup_p95: float = 30.0,
    warmup_p99: float = 80.0,
) -> dict:
    """Build a realistic k6 --summary-export JSON with measure + warmup submetrics."""
    return {
        "metrics": {
            "http_reqs": {
                "count": warmup_count + measure_count,
                "rate": (warmup_count + measure_count) / 70.0,
            },
            "http_reqs{phase:measure}": {
                "count": measure_count,
                "rate": measure_rate,
            },
            "http_req_duration": {
                "med": warmup_med,
                "p(95)": warmup_p95,
                "p(99)": warmup_p99,
            },
            "http_req_duration{phase:measure}": {
                "med": measure_med,
                "p(95)": measure_p95,
                "p(99)": measure_p99,
            },
            "http_req_failed": {
                "value": fail_rate * 2,
            },
            "http_req_failed{phase:measure}": {
                "value": fail_rate,
            },
        }
    }


def _make_rss_csv(
    *,
    warmup_s: int = 10,
    total_s: int = 70,
    base_ts: int = 1000000,
    rss_kb: int = 50000,
) -> str:
    """Build a realistic RSS CSV (timestamps are epoch seconds)."""
    lines = ["ts_epoch,rss_kb,cpu_pct"]
    for i in range(total_s):
        ts = base_ts + i  # 1-second intervals (matches sample-rss.sh)
        lines.append(f"{ts},{rss_kb + i * 10},{2.5 + (i % 5) * 0.1:.2f}")
    return "\n".join(lines) + "\n"


class TestParseK6Summary:
    """Test the k6 summary parser with fixture data."""

    def test_extracts_measure_phase_metrics(self, tmp_path):
        """Parser uses measure-phase percentiles, not warmup."""
        summary = _make_summary(
            measure_med=5.0, measure_p95=20.0, measure_p99=50.0,
            warmup_med=80.0, warmup_p95=300.0, warmup_p99=800.0,
        )
        summary_path = tmp_path / "summary.json"
        summary_path.write_text(json.dumps(summary))

        rss_path = tmp_path / "rss.csv"
        rss_path.write_text(_make_rss_csv())

        result = parse_k6_summary(str(summary_path), str(rss_path), duration_s=60, warmup_s=10)

        # Must use measure-phase values, NOT warmup
        assert result["p50_ms"] == 5.0
        assert result["p95_ms"] == 20.0
        assert result["p99_ms"] == 50.0

    def test_computes_rps_from_measure_count(self, tmp_path):
        """RPS = measure_count / duration_s, not aggregate rate."""
        summary = _make_summary(measure_count=60000, measure_rate=999.0)
        summary_path = tmp_path / "summary.json"
        summary_path.write_text(json.dumps(summary))

        rss_path = tmp_path / "rss.csv"
        rss_path.write_text(_make_rss_csv())

        result = parse_k6_summary(str(summary_path), str(rss_path), duration_s=60, warmup_s=10)

        # RPS should be 60000 / 60 = 1000, NOT the aggregate rate
        assert result["rps_sustained"] == 1000.0

    def test_error_count_from_measure_only(self, tmp_path):
        """Error count = fail_fraction * measure_count, not aggregate."""
        summary = _make_summary(measure_count=60000, fail_rate=0.01)
        summary_path = tmp_path / "summary.json"
        summary_path.write_text(json.dumps(summary))

        rss_path = tmp_path / "rss.csv"
        rss_path.write_text(_make_rss_csv())

        result = parse_k6_summary(str(summary_path), str(rss_path), duration_s=60, warmup_s=10)

        assert result["total_requests"] == 60000
        assert result["total_errors"] == 600  # 0.01 * 60000
        assert result["error_rate_pct"] == 1.0

    def test_fails_without_measure_duration(self, tmp_path):
        """Parser raises ValueError if measure-phase duration is missing."""
        summary = {
            "metrics": {
                "http_reqs{phase:measure}": {"count": 100},
                # No http_req_duration{phase:measure}
            }
        }
        summary_path = tmp_path / "summary.json"
        summary_path.write_text(json.dumps(summary))

        rss_path = tmp_path / "rss.csv"
        rss_path.write_text("ts_epoch,rss_kb,cpu_pct\n")

        with pytest.raises(ValueError, match="measure-phase submetrics"):
            parse_k6_summary(str(summary_path), str(rss_path), duration_s=60, warmup_s=10)

    def test_fails_without_measure_reqs(self, tmp_path):
        """Parser raises ValueError if measure-phase reqs is missing."""
        summary = {
            "metrics": {
                "http_req_duration{phase:measure}": {"med": 5, "p(95)": 20, "p(99)": 50},
                # No http_reqs{phase:measure}
            }
        }
        summary_path = tmp_path / "summary.json"
        summary_path.write_text(json.dumps(summary))

        rss_path = tmp_path / "rss.csv"
        rss_path.write_text("ts_epoch,rss_kb,cpu_pct\n")

        with pytest.raises(ValueError, match="measure-phase submetrics"):
            parse_k6_summary(str(summary_path), str(rss_path), duration_s=60, warmup_s=10)

    def test_fails_with_zero_measure_count(self, tmp_path):
        """Parser raises ValueError if measure count is 0."""
        summary = _make_summary(measure_count=0)
        summary_path = tmp_path / "summary.json"
        summary_path.write_text(json.dumps(summary))

        rss_path = tmp_path / "rss.csv"
        rss_path.write_text("ts_epoch,rss_kb,cpu_pct\n")

        with pytest.raises(ValueError, match="no requests in measure"):
            parse_k6_summary(str(summary_path), str(rss_path), duration_s=60, warmup_s=10)

    def test_rss_excludes_warmup(self, tmp_path):
        """RSS average excludes the first warmup_s seconds."""
        summary = _make_summary()
        summary_path = tmp_path / "summary.json"
        summary_path.write_text(json.dumps(summary))

        # RSS = 50000 during warmup, then 100000 after warmup
        # Timestamps are epoch seconds (matching sample-rss.sh's `date +%s`)
        lines = ["ts_epoch,rss_kb,cpu_pct"]
        base_ts = 1000000
        for i in range(70):
            ts = base_ts + i  # 1-second intervals
            rss = 50000 if i < 10 else 100000
            lines.append(f"{ts},{rss},5.00")
        rss_path = tmp_path / "rss.csv"
        rss_path.write_text("\n".join(lines) + "\n")

        result = parse_k6_summary(str(summary_path), str(rss_path), duration_s=60, warmup_s=10)

        # Peak should be max of all (100000)
        assert result["peak_rss_mb"] == pytest.approx(100000 / 1024.0)
        # Average should only use post-warmup values (all 100000)
        assert result["avg_rss_mb"] == pytest.approx(100000 / 1024.0)

    def test_rss_missing_file(self, tmp_path):
        """Parser gracefully handles missing RSS file."""
        summary = _make_summary()
        summary_path = tmp_path / "summary.json"
        summary_path.write_text(json.dumps(summary))

        rss_path = tmp_path / "nonexistent.csv"

        result = parse_k6_summary(str(summary_path), str(rss_path), duration_s=60, warmup_s=10)

        assert result["peak_rss_mb"] is None
        assert result["avg_rss_mb"] is None

    def test_warmup_does_not_contaminate(self, tmp_path):
        """Warmup-only metrics (higher latency) are never used."""
        summary = _make_summary(
            measure_med=1.0, measure_p95=5.0, measure_p99=10.0,
            warmup_med=100.0, warmup_p95=500.0, warmup_p99=1000.0,
            measure_count=100000, warmup_count=50000,
        )
        summary_path = tmp_path / "summary.json"
        summary_path.write_text(json.dumps(summary))

        rss_path = tmp_path / "rss.csv"
        rss_path.write_text(_make_rss_csv())

        result = parse_k6_summary(str(summary_path), str(rss_path), duration_s=60, warmup_s=10)

        # If warmup contaminated, p99 would be 1000 instead of 10
        assert result["p99_ms"] == 10.0
        assert result["p50_ms"] == 1.0
        assert result["rps_sustained"] == pytest.approx(100000 / 60.0)
