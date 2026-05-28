<script lang="ts">
  import { fmtFloat } from '$lib/format';
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
  {data.run.cpu_model ?? 'Unknown'} · {data.run.cpu_cores} cores · {data.run.total_ram_mb?.toLocaleString() ?? '—'} MB RAM
</p>
<a href="/runs/{data.run.id}/memory" class="brut-link text-sm">→ MEMORY DETAIL</a>
<hr class="brut-rule" />

{#each frameworks as fw}
  <div class="brut-eyebrow mt-8 mb-2">{fw.toUpperCase()}</div>
  <div class="brut-table-wrap">
    <table class="brut-table-auto">
      <thead>
        <tr>
          <th>ENDPOINT</th>
          <th class="num">c</th>
          <th class="num">RPS</th>
          <th class="num">p99 (ms)</th>
          <th class="num">ERR%</th>
          <th class="num">RSS (MB)</th>
        </tr>
      </thead>
      <tbody>
        {#each byFramework.get(fw) ?? [] as r}
          <tr>
            <td class="text-xs">{r.endpoint}</td>
            <td class="num">{r.concurrency}</td>
            <td class="num">{fmtFloat(r.rps_sustained, 1)}</td>
            <td class="num">{fmtFloat(r.p99_ms, 0)}</td>
            <td class="num">{fmtFloat(r.error_rate_pct, 1)}</td>
            <td class="num">{fmtFloat(r.peak_rss_mb, 1)}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
{/each}
