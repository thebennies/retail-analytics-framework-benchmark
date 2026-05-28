<script lang="ts">
  import { onMount } from 'svelte';
  import { colorFor } from '$lib/colors';
  import { fmtFloat } from '$lib/format';

  let { data }: { data: any } = $props();

  let rpsChart: any = null;
  let p99Chart: any = null;
  let rssChart: any = null;

  let rpsCanvas: HTMLCanvasElement;
  let p99Canvas: HTMLCanvasElement;
  let rssCanvas: HTMLCanvasElement;

  onMount(async () => {
    const { Chart, registerables } = await import('chart.js');
    Chart.register(...registerables);

    const labels = data.series.length > 0
      ? data.series[0].points.map((p: any) => `c=${p.concurrency}`)
      : [];

    const makeDatasets = (field: string) =>
      data.series.map((s: any) => ({
        label: s.framework,
        data: s.points.map((p: any) => p[field]),
        borderColor: colorFor(s.framework),
        backgroundColor: colorFor(s.framework) + '33',
        tension: 0.3,
        fill: false,
      }));

    const commonOpts = {
      responsive: true,
      plugins: { legend: { labels: { color: '#cbd5e1' } } },
      scales: {
        x: { ticks: { color: '#94a3b8' }, grid: { color: '#1e293b' } },
        y: { ticks: { color: '#94a3b8' }, grid: { color: '#1e293b' } },
      },
    };

    if (labels.length > 0) {
      rpsChart = new Chart(rpsCanvas, {
        type: 'line',
        data: { labels, datasets: makeDatasets('rps_sustained') },
        options: { ...commonOpts, plugins: { ...commonOpts.plugins, title: { display: true, text: 'RPS (sustained)', color: '#e2e8f0' } } },
      });

      p99Chart = new Chart(p99Canvas, {
        type: 'line',
        data: { labels, datasets: makeDatasets('p99_ms') },
        options: { ...commonOpts, plugins: { ...commonOpts.plugins, title: { display: true, text: 'p99 latency (ms)', color: '#e2e8f0' } } },
      });

      rssChart = new Chart(rssCanvas, {
        type: 'line',
        data: { labels, datasets: makeDatasets('peak_rss_mb') },
        options: { ...commonOpts, plugins: { ...commonOpts.plugins, title: { display: true, text: 'Peak RSS (MB)', color: '#e2e8f0' } } },
      });
    }
  });

  function setParam(key: string, value: string) {
    const u = new URL(data.endpoint ? `?endpoint=${data.endpoint}` : '/', window.location.origin);
    u.searchParams.set('endpoint', data.endpoint);
    u.searchParams.set('frameworks', data.frameworks.join(','));
    if (key === 'endpoint') u.searchParams.set('endpoint', value);
    if (key === 'frameworks') u.searchParams.set('frameworks', value);
    window.location.search = u.searchParams.toString();
  }
</script>

<svelte:head><title>Compare Frameworks</title></svelte:head>

<h1 class="text-2xl font-bold mb-4">Compare Frameworks</h1>

<div class="flex gap-4 mb-6 flex-wrap">
  <label class="text-sm">
    Endpoint:
    <select class="bg-slate-800 text-white px-2 py-1 rounded text-sm" value={data.endpoint}
      onchange={(e) => setParam('endpoint', (e.target as HTMLSelectElement).value)}>
      {#each data.endpoints as ep}
        <option value={ep}>{ep}</option>
      {/each}
    </select>
  </label>

  <label class="text-sm flex items-center gap-2">
    Frameworks:
    {#each data.allFrameworks as fw}
      <label class="inline-flex items-center gap-1">
        <input type="checkbox" checked={data.frameworks.includes(fw)}
          onchange={() => {
            const next = data.frameworks.includes(fw)
              ? data.frameworks.filter((f: string) => f !== fw)
              : [...data.frameworks, fw];
            if (next.length > 0) setParam('frameworks', next.join(','));
          }} />
        <span style="color: {colorFor(fw)}">{fw}</span>
      </label>
    {/each}
  </label>
</div>

{#if data.series.length === 0 || data.series.every((s: any) => s.points.length === 0)}
  <p class="text-slate-400">No data for endpoint <code class="text-cyan-400">{data.endpoint}</code>. Run a benchmark first.</p>
{:else}
  <div class="grid grid-cols-1 gap-6">
    <div class="bg-slate-900 rounded p-4">
      <canvas bind:this={rpsCanvas}></canvas>
    </div>
    <div class="bg-slate-900 rounded p-4">
      <canvas bind:this={p99Canvas}></canvas>
    </div>
    <div class="bg-slate-900 rounded p-4">
      <canvas bind:this={rssCanvas}></canvas>
    </div>
  </div>

  <div class="mt-6">
    <h2 class="text-lg font-semibold mb-2">Raw data</h2>
    <table>
      <thead>
        <tr>
          <th>Framework</th>
          <th class="text-right">c</th>
          <th class="text-right">RPS</th>
          <th class="text-right">p99 (ms)</th>
          <th class="text-right">Err %</th>
          <th class="text-right">Peak RSS</th>
        </tr>
      </thead>
      <tbody>
        {#each data.series as s}
          {#each s.points as p}
            <tr>
              <td style="color: {colorFor(s.framework)}">{s.framework}</td>
              <td class="text-right">{p.concurrency}</td>
              <td class="text-right">{fmtFloat(p.rps_sustained, 1)}</td>
              <td class="text-right">{fmtFloat(p.p99_ms, 0)}</td>
              <td class="text-right">{fmtFloat(p.error_rate_pct, 1)}</td>
              <td class="text-right">{fmtFloat(p.peak_rss_mb, 1)} MB</td>
            </tr>
          {/each}
        {/each}
      </tbody>
    </table>
  </div>
{/if}
