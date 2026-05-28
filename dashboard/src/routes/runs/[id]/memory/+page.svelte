<script lang="ts">
  import { onMount } from 'svelte';
  import { FRAMEWORK_COLOR, barDatasetDefaults, BRUTALIST_SCALE, BRUTALIST_LEGEND, BRUTALIST_TOOLTIP } from '$lib/charts/palette';

  let { data }: { data: { runId: number; results: any[] } } = $props();

  let rssCanvas: HTMLCanvasElement;
  let rssChart: any = null;

  onMount(async () => {
    if (data.results.length === 0) return;
    const { Chart, registerables } = await import('chart.js');
    Chart.register(...registerables);

    // Group by concurrency
    const concurrencies = [...new Set(data.results.map(r => r.concurrency))].sort((a, b) => a - b);
    const frameworks = [...new Set(data.results.map(r => r.framework))].sort();

    const datasets = frameworks.map(fw => ({
      ...barDatasetDefaults(fw as any),
      label: fw,
      data: concurrencies.map(c => {
        const r = data.results.find(r => r.framework === fw && r.concurrency === c);
        return r?.peak_rss_mb ?? 0;
      }),
    }));

    rssChart = new Chart(rssCanvas, {
      type: 'bar',
      data: { labels: concurrencies.map(c => `c=${c}`), datasets },
      options: {
        responsive: true,
        animation: { duration: 0 },
        plugins: { legend: BRUTALIST_LEGEND, tooltip: BRUTALIST_TOOLTIP },
        scales: {
          x: { ...BRUTALIST_SCALE },
          y: { ...BRUTALIST_SCALE, title: { ...BRUTALIST_SCALE.title, display: true, text: 'PEAK RSS (MB)' } },
        },
      },
    });
  });
</script>

<svelte:head><title>Memory Detail — Run #{data.runId}</title></svelte:head>

<div class="brut-eyebrow mb-3">MEMORY DETAIL</div>
<h1 class="brut-headline text-display-md">Run #{data.runId}</h1>
<hr class="brut-rule" />

<a href="/runs/{data.runId}" class="brut-link text-sm">← BACK TO RUN</a>

{#if data.results.length === 0}
  <div class="brut-card brut-hatch mt-4">
    <p class="font-mono text-sm text-bone-dim">No RSS data available for this run.</p>
  </div>
{:else}
  <div class="brut-card mt-6">
    <div class="brut-eyebrow mb-2">PEAK RSS BY CONCURRENCY</div>
    <canvas bind:this={rssCanvas}></canvas>
  </div>

  <table class="brut-table mt-8">
    <thead>
      <tr>
        <th>FRAMEWORK</th>
        <th>ENDPOINT</th>
        <th class="num">c</th>
        <th class="num">PEAK RSS</th>
        <th class="num">AVG RSS</th>
      </tr>
    </thead>
    <tbody>
      {#each data.results as r}
        <tr>
          <td style="color: {FRAMEWORK_COLOR[r.framework as any] ?? '#888'}">{r.framework}</td>
          <td class="font-mono text-xs">{r.endpoint}</td>
          <td class="num">{r.concurrency}</td>
          <td class="num">{r.peak_rss_mb?.toFixed(1) ?? '—'} MB</td>
          <td class="num">{r.avg_rss_mb?.toFixed(1) ?? '—'} MB</td>
        </tr>
      {/each}
    </tbody>
  </table>
{/if}
