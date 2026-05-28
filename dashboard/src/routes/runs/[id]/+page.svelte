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

<h1 class="text-2xl font-bold mb-2">Run #{data.run.id}</h1>
<p class="text-sm text-slate-400 mb-4">
  {fmtDate(data.run.started_at)} · {data.run.cpu_model ?? 'Unknown CPU'} ·
  {data.run.cpu_cores} cores · {fmtInt(data.run.total_ram_mb)} MB RAM
</p>

{#each frameworks as fw}
  <h2 class="text-lg font-semibold mt-6 mb-2 capitalize">{fw}</h2>
  <table>
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
