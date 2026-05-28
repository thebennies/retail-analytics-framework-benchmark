<script lang="ts">
  import { fmtDate, fmtFloat, fmtInt } from '$lib/format';
  import type { BenchmarkResult } from '$lib/db';

  let { data }: { data: { run: any; results: BenchmarkResult[] } } = $props();

  // Group by framework
  const byFramework = new Map<string, BenchmarkResult[]>();
  for (const r of data.results) {
    const list = byFramework.get(r.framework) ?? [];
    list.push(r);
    byFramework.set(r.framework, list);
  }
  const frameworks = [...byFramework.keys()].sort();
</script>

<svelte:head><title>Run #{data.run.id}</title></svelte:head>

<h1 class="brut-headline text-display-lg">Run #{data.run.id}</h1>
<p class="font-mono text-sm text-bone-dim mb-2">
  {fmtDate(data.run.started_at)} · {data.run.cpu_model ?? 'Unknown'} · {data.run.cpu_cores} cores
</p>
<a href="/runs/{data.run.id}/memory" class="brut-link text-sm">→ MEMORY DETAIL</a>
<hr class="brut-rule" />

{#each frameworks as fw}
  <h2 class="brut-headline text-display-md mt-6 mb-2">{fw}</h2>
  <table class="brut-table">
    <thead>
      <tr>
        <th>Endpoint</th>
        <th class="text-right">c</th>
        <th class="text-right">RPS</th>
        <th class="text-right">p99 (ms)</th>
        <th class="text-right">Err %</th>
        <th class="text-right">Peak RSS</th>
      </tr>
    </thead>
    <tbody>
      {#each byFramework.get(fw) ?? [] as r}
        <tr>
          <td class="font-mono text-xs">{r.endpoint}</td>
          <td class="text-right">{r.concurrency}</td>
          <td class="text-right">{fmtFloat(r.rps_sustained, 1)}</td>
          <td class="text-right">{fmtFloat(r.p99_ms, 0)}</td>
          <td class="text-right">{fmtFloat(r.error_rate_pct, 1)}</td>
          <td class="text-right">{fmtFloat(r.peak_rss_mb, 1)} MB</td>
        </tr>
      {/each}
    </tbody>
  </table>
{/each}
