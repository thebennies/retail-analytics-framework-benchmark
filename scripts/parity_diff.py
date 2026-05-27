#!/usr/bin/env python3
"""Per-endpoint structural JSON diff with type-aware tolerance."""
import argparse
import json
import math
import sys
from pathlib import Path
from typing import Any, Callable

SORT_KEYS = {
    "daily-sales": lambda r: r["date"],
    "sales-by-location": lambda r: r["id"],
    "sales-by-product": lambda r: r["id"],
    "sales-by-payment": lambda r: r.get("id") if "id" in r else r.get("payment_method"),
    "hourly-sales": lambda r: r["hour_of_day"],
    "top-products": lambda r: r["id"],
    "location-product-matrix": lambda r: (r.get("location_id"), r.get("category")),
    "discount-impact": lambda r: r.get("cohort", ""),
}

INT_KEY_SUFFIXES = ("_count", "_id")
INT_KEY_NAMES = {"qty_sold", "hour_of_day", "rows_returned", "id"}
STR_KEY_NAMES = {
    "date", "name", "sku", "category", "city", "region",
    "payment_method", "cohort", "task",
}
NUMERIC_TOLERANCE = 0.01


def is_int_key(k):
    return k in INT_KEY_NAMES or any(k.endswith(s) for s in INT_KEY_SUFFIXES)


def is_str_key(k):
    return k in STR_KEY_NAMES


def diff_row(baseline, candidate, path):
    diffs = []
    keys = set(baseline.keys()) | set(candidate.keys())
    for k in sorted(keys):
        if k not in baseline:
            diffs.append(f"{path}: missing key in baseline: {k}")
            continue
        if k not in candidate:
            diffs.append(f"{path}: missing key in candidate: {k}")
            continue
        a, b = baseline[k], candidate[k]
        if a is None and b is None:
            continue
        if a is None or b is None:
            diffs.append(f"{path}.{k}: null mismatch baseline={a!r} candidate={b!r}")
            continue
        if is_int_key(k) or is_str_key(k):
            if a != b:
                diffs.append(f"{path}.{k}: exact mismatch baseline={a!r} candidate={b!r}")
        else:
            try:
                fa, fb = float(a), float(b)
            except (TypeError, ValueError):
                diffs.append(f"{path}.{k}: non-numeric mismatch baseline={a!r} candidate={b!r}")
                continue
            if math.isnan(fa) or math.isnan(fb):
                diffs.append(f"{path}.{k}: NaN encountered")
                continue
            if abs(fa - fb) > NUMERIC_TOLERANCE:
                diffs.append(f"{path}.{k}: |{fa} - {fb}| = {abs(fa-fb):.6f} > {NUMERIC_TOLERANCE}")
    return diffs


def diff_result_lists(baseline_rows, candidate_rows, endpoint, path_prefix="result"):
    if len(baseline_rows) != len(candidate_rows):
        return [f"{path_prefix}: rows_returned mismatch baseline={len(baseline_rows)} candidate={len(candidate_rows)}"]
    sort_key = SORT_KEYS.get(endpoint)
    if sort_key is None:
        return [f"{path_prefix}: no SORT_KEYS entry for endpoint `{endpoint}`"]
    try:
        baseline_sorted = sorted(baseline_rows, key=sort_key)
        candidate_sorted = sorted(candidate_rows, key=sort_key)
    except (KeyError, TypeError) as e:
        return [f"{path_prefix}: sort key error: {e}"]
    diffs = []
    for i, (a, b) in enumerate(zip(baseline_sorted, candidate_sorted)):
        diffs.extend(diff_row(a, b, f"{path_prefix}[{i}]"))
        if len(diffs) >= 5:
            break
    return diffs


def diff_full_summary(baseline_rows, candidate_rows):
    if len(baseline_rows) != len(candidate_rows):
        return [f"full-summary: sub-task count mismatch baseline={len(baseline_rows)} candidate={len(candidate_rows)}"]
    baseline_by_task = {r["task"]: r for r in baseline_rows}
    candidate_by_task = {r["task"]: r for r in candidate_rows}
    if set(baseline_by_task) != set(candidate_by_task):
        return [f"full-summary: task set mismatch baseline={sorted(baseline_by_task)} candidate={sorted(candidate_by_task)}"]
    diffs = []
    for task, b_sub in baseline_by_task.items():
        c_sub = candidate_by_task[task]
        if b_sub["rows_returned"] != c_sub["rows_returned"]:
            diffs.append(f"full-summary.{task}: rows_returned mismatch baseline={b_sub['rows_returned']} candidate={c_sub['rows_returned']}")
            continue
        diffs.extend(diff_result_lists(b_sub["result"], c_sub["result"], task, f"full-summary.{task}"))
        if len(diffs) >= 5:
            break
    return diffs


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--endpoint", required=True)
    ap.add_argument("--baseline", required=True, type=Path)
    ap.add_argument("--candidate", required=True, type=Path)
    args = ap.parse_args()

    with args.baseline.open() as f:
        baseline = json.load(f)
    with args.candidate.open() as f:
        candidate = json.load(f)

    if baseline.get("task") != candidate.get("task"):
        print(f"[{args.endpoint}] task field mismatch baseline={baseline.get('task')!r} candidate={candidate.get('task')!r}")
        return 1

    if baseline.get("rows_returned") != candidate.get("rows_returned"):
        print(f"[{args.endpoint}] rows_returned mismatch baseline={baseline.get('rows_returned')} candidate={candidate.get('rows_returned')}")
        return 1

    baseline_rows = baseline.get("result", [])
    candidate_rows = candidate.get("result", [])

    if args.endpoint == "full-summary":
        diffs = diff_full_summary(baseline_rows, candidate_rows)
    else:
        diffs = diff_result_lists(baseline_rows, candidate_rows, args.endpoint)

    if not diffs:
        print(f"[{args.endpoint}] OK ({len(baseline_rows)} rows)")
        return 0

    print(f"[{args.endpoint}] FAIL ({len(diffs)} diff(s)):")
    for d in diffs[:5]:
        print(f"  - {d}")
    return 1


if __name__ == "__main__":
    sys.exit(main())
