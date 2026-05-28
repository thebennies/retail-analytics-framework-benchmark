<script lang="ts">
  import { onMount } from 'svelte';
  import { FRAMEWORK_COLOR, lineDatasetDefaults, BRUTALIST_SCALE, BRUTALIST_LEGEND, BRUTALIST_TOOLTIP } from '$lib/charts/palette';

  let { data }: { data: any } = $props();

  let rpsCanvas: HTMLCanvasElement;
  let latencyCanvas: HTMLCanvasElement;
  let rssCanvas: HTMLCanvasElement;
  let rpsChart: any = null;
  let latencyChart: any = null;
  let rssChart: any = null;

  onMount(async () => {
    const { Chart, registerables } = await import('chart.js');
    Chart.register(...registerables);

    const labels = data.series.length > 0
      ? data.series[0].points.map((p: any) => `c=${p.concurrency}`)
      : [];

    const makeDatasets = (field: string) =>
      data.series.map((s: any) => ({
        ...lineDatasetDefaults(s.framework as any),
        label: s.framework,
        data: s.points.map((p: any) => p[field]),
      }));

    const commonOpts = (title: string) => ({
      responsive: true,
      animation: { duration: 0 },
      plugins: {
        legend: BRUTALIST_LEGEND,
        tooltip: BRUTALIST_TOOLTIP,
        title: { display: true, text: title, color: '#f5f5f0', font: { family: 'JetBrains Mono', size: 14, weight: 700 } },
      },
      scales: {
        x: { ...BRUTALIST_SCALE },
        y: { ...BRUTALIST_SCALE },
      },
    });

    if (labels.length > 0) {
      rpsChart = new Chart(rpsCanvas, {
        type: 'line',
        data: { labels, datasets: makeDatasets('rps_sustained') },
        options: commonOpts('SUSTAINED RPS'),
      });

      // p50/p95/p99 grouped bar chart
      const latencyDs: any[] = [];
      for (const s of data.series) {
        for (const [metric, label] of [['p50_ms', 'p50'], ['p95_ms', 'p95'], ['p99_ms', 'p99']] as const) {
          latencyDs.push({
            ...lineDatasetDefaults(s.framework as any),
            label: `${s.framework} ${label}`,
            data: s.points.map((p: any) => p[metric]),
            borderWidth: metric === 'p99_ms' ? 3 : 1,
          });
        }
      }
      latencyChart = new Chart(latencyCanvas, {
        type: 'line',
        data: { labels, datasets: latencyDs },
        options: commonOpts('LATENCY (ms) — p50 / p95 / p99'),
      });

      rssChart = new Chart(rssCanvas, {
        type: 'line',
        data: { labels, datasets: makeDatasets('peak_rss_mb') },
        options: commonOpts('PEAK RSS (MB)'),
      });
    }
  });
</script>

<svelte:head><title>Compare Frameworks</title></svelte:head>

<div class="brut-eyebrow mb-3">02 / COMPARE</div>
<h1 class="brut-headline text-display-lg">Compare</h1>
<hr class="brut-rule" />

<div class="flex gap-4 mb-8 flex-wrap">
  <label class="text-sm font-mono text-bone-dim">
    ENDPOINT:
    <select class="brut-input" value={data.endpoint}
      onchange={(e) => {
        const u = new URL(window.location.href);
        u.searchParams.set('endpoint', (e.target as HTMLSelectElement).value);
        window.location.search = u.searchParams.toString();
      }}>
      {#each data.endpoints as ep}
        <option value={ep}>{ep}</option>
      {/each}
    </select>
  </label>

  <span class="flex items-center gap-3">
    {#each data.allFrameworks as fw}
      <label class="inline-flex items-center gap-1 font-mono text-xs">
        <input type="checkbox" checked={data.frameworks.includes(fw)}
          onchange={() => {
            const next = data.frameworks.includes(fw)
              ? data.frameworks.filter((f: string) => f !== fw)
              : [...data.frameworks, fw];
            if (next.length > 0) {
              const u = new URL(window.location.href);
              u.searchParams.set('frameworks', next.join(','));
              window.location.search = u.searchParams.toString();
            }
          }} />
        <span style="color: {FRAMEWORK_COLOR[fw as any] ?? '#888'}">{fw}</span>
      </label>
    {/each}
  </span>
</div>

{#if data.series.length === 0 || data.series.every((s: any) => s.points.length === 0)}
  <div class="brut-card brut-hatch">
    <p class="font-mono text-sm text-bone-dim">No data for endpoint <span class="text-zap">{data.endpoint}</span>.</p>
  </div>
{:else}
  <div class="grid grid-cols-1 gap-8 mb-8">
    <div class="brut-card"><canvas bind:this={rpsCanvas}></canvas></div>
    <div class="brut-card"><canvas bind:this={latencyCanvas}></canvas></div>
    <div class="brut-card"><canvas bind:this={rssCanvas}></canvas></div>
  </div>

  <div class="brut-table-wrap">
    <table class="brut-table-auto">
      <colgroup>
        <col style="width: 100px" />
        <col style="width: 60px" />
        <col style="width: 70px" />
        <col style="width: 60px" />
        <col style="width: 60px" />
        <col style="width: 60px" />
        <col style="width: 60px" />
        <col style="width: 80px" />
      </colgroup>
      <thead>
        <tr>
          <th>FW</th>
          <th class="num">c</th>
          <th class="num">RPS</th>
          <th class="num">p50</th>
          <th class="num">p95</th>
          <th class="num">p99</th>
          <th class="num">ERR%</th>
          <th class="num">RSS MB</th>
        </tr>
      </thead>
      <tbody>
        {#each data.series as s}
          {#each s.points as p}
            <tr>
              <td style="color: {FRAMEWORK_COLOR[s.framework as any] ?? '#888'}">{s.framework}</td>
              <td class="num">{p.concurrency}</td>
              <td class="num">{p.rps_sustained?.toFixed(1) ?? '—'}</td>
              <td class="num">{p.p50_ms?.toFixed(0) ?? '—'}</td>
              <td class="num">{p.p95_ms?.toFixed(0) ?? '—'}</td>
              <td class="num">{p.p99_ms?.toFixed(0) ?? '—'}</td>
              <td class="num">{p.error_rate_pct?.toFixed(1) ?? '—'}</td>
              <td class="num">{p.peak_rss_mb?.toFixed(1) ?? '—'}</td>
            </tr>
          {/each}
        {/each}
      </tbody>
    </table>
  </div>
{/if}
