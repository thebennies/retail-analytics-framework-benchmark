# Sales-Stack Benchmark — Decision Memo

> Internal decision memo. Snapshot in time, valid only for the hardware captured below. Do not extrapolate.

**Run ID:** {{run_id}}
**Concurrency level analyzed:** c={{concurrency_level}}
**Exported:** {{exported_at}}

---

## 1. Hardware Context

| Item | Value |
|---|---|
| CPU model | {{cpu_model}} |
| CPU cores / threads | {{cpu_cores}} / {{cpu_threads}} |
| Total RAM | {{total_ram_mb}} MB |
| Disk type | {{disk_type}} |
| Kernel | {{kernel_version}} |
| OS | {{ubuntu_version}} |
| Docker | {{docker_version}} |
| PostgreSQL | {{postgres_version}} |
| Hypervisor | {{hypervisor}} |
| cgroup | {{cgroup_version}} |

---

## 2. Pareto Table (primary deliverable)

{{pareto_table}}

Reading guide:
- "Sustained RPS" — closed-loop k6, measured over 60s steady state after 10s warmup.
- "p99" — http_req_duration p99 from the measure phase.
- "Peak RSS" — max value sampled at 1s interval during measure phase.
- "Max stable concurrency" — highest concurrency level where error rate < 1%.

A framework that is strictly worse than another on every column is **Pareto-dominated** and is not a candidate. The remaining frameworks are the Pareto frontier — pick by weighting the dimensions you care about (see section 3).

---

## 3. Weighted Score (secondary, opinionated)

Weights used (sum = 100):

{{weights_table}}

Per-framework normalized scores (0-100 per dimension) and final weighted total:

{{weighted_scores}}

---

## 4. Recommendation (auto)

**Recommended framework: {{recommended_framework}}**

{{rationale}}

---

## 5. Manual Assessment Sections

> Fill these in after export. They are not auto-derivable from benchmark numbers.

### 5.1 Ecosystem assessment

_(fill in)_

### 5.2 Hiring availability

_(fill in)_

### 5.3 Dev velocity notes

_(fill in)_

### 5.4 Final recommendation (post-discussion)

_(fill in)_

---

## 6. Caveats reminder

1. Results valid only for the hardware in section 1. Do not extrapolate.
2. Snapshot in time. Re-run before relying on this 3+ months from now.
3. At high concurrency, PgBouncer pool (size=100) is the bottleneck, not the framework — what is measured is how each framework handles connection wait + event-loop saturation.
4. Dashboard / methodology details in `docs/METHODOLOGY.md` and `docs/CAVEATS.md`.
