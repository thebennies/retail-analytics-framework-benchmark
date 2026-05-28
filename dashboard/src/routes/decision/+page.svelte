<script lang="ts">
  import { onMount } from 'svelte';
  import { DIMENSION_LABELS, type Dimension } from '$lib/scoring';
  import { FRAMEWORK_COLOR, BRUTALIST_SCALE, BRUTALIST_LEGEND, BRUTALIST_TOOLTIP } from '$lib/charts/palette';
  import { fmtFloat } from '$lib/format';

  let { data }: { data: any } = $props();

  let scatterCanvas: HTMLCanvasElement;
  let scatterChart: any = null;

  onMount(async () => {
    if (data.scored.length < 2) return;
    const { Chart, registerables } = await import('chart.js');
    Chart.register(...registerables);

    const datasets = data.scored.map((s: any) => ({
      label: s.framework,
      data: [{ x: s.dimensions.p99_ms.raw ?? 0, y: s.dimensions.sustained_rps.raw ?? 0, r: 10 }],
      backgroundColor: FRAMEWORK_COLOR[s.framework as any] ?? '#888',
      borderColor: '#f5f5f0',
      borderWidth: 2,
    }));

    scatterChart = new Chart(scatterCanvas, {
      type: 'bubble',
      data: { datasets },
      options: {
        responsive: true,
        animation: { duration: 0 },
        plugins: { legend: BRUTALIST_LEGEND, tooltip: BRUTALIST_TOOLTIP },
        scales: {
          x: { ...BRUTALIST_SCALE, title: { ...BRUTALIST_SCALE.title, display: true, text: 'p99 (ms) — lower →' } },
          y: { ...BRUTALIST_SCALE, title: { ...BRUTALIST_SCALE.title, display: true, text: 'RPS — higher ↑' } },
        },
      },
    });
  });

  async function saveDevScore(fw: string, score: number) {
    await fetch('/api/decision', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ run_id: data.runId, framework: fw, dev_experience_score: score }),
    });
  }

  async function handleExport() {
    const res = await fetch(`/api/export/${data.runId}?concurrency=${data.concurrency}`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `decision-memo-${data.runId}-${new Date().toISOString().slice(0, 10)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function recompute(params: Record<string, string>) {
    const u = new URL(window.location.href);
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
    window.location.search = u.searchParams.toString();
  }
</script>

<svelte:head><title>Decision</title></svelte:head>

<div class="brut-eyebrow mb-3">03 / DECISION</div>
<h1 class="brut-headline text-display-lg">Decision</h1>
<hr class="brut-rule" />

<div class="flex gap-4 mb-8 flex-wrap items-end">
  <label class="text-sm font-mono text-bone-dim">
    RUN
    <select class="brut-input" value={data.runId}
      onchange={(e) => recompute({ runId: (e.target as HTMLSelectElement).value })}>
      {#each data.runs as run}
        <option value={run.id}>#{run.id}</option>
      {/each}
    </select>
  </label>
  <label class="text-sm font-mono text-bone-dim">
    CONCURRENCY
    <select class="brut-input" value={data.concurrency}
      onchange={(e) => recompute({ concurrency: (e.target as HTMLSelectElement).value })}>
      {#each data.concLevels as c}
        <option value={c}>c={c}</option>
      {/each}
    </select>
  </label>
</div>

{#if data.scored.length > 0}
  <!-- Pareto scatter -->
  <div class="brut-card mb-8">
    <div class="brut-eyebrow mb-2">PARETO FRONT — RPS vs p99</div>
    <canvas bind:this={scatterCanvas}></canvas>
  </div>

  <!-- Scored table -->
  <div class="brut-eyebrow mb-2">WEIGHTED SCORES</div>
  <div class="brut-table-wrap mb-8">
    <table class="brut-table-auto">
    <thead>
      <tr>
        <th>FW</th>
        <th class="num">SCORE</th>
        {#each Object.keys(DIMENSION_LABELS) as dim}
          <th class="num">{(DIMENSION_LABELS as any)[dim].split(' ')[0]}</th>
        {/each}
      </tr>
    </thead>
    <tbody>
      {#each data.scored as s, i}
        <tr class="{i === 0 ? 'bg-ink-700' : ''}">
          <td class="font-bold" style="color: {FRAMEWORK_COLOR[s.framework as any] ?? '#888'}">{s.framework}</td>
          <td class="num font-bold text-acid">{s.weighted_total.toFixed(1)}</td>
          {#each Object.entries(s.dimensions) as [dim, d]}
            <td class="num" title="raw: {(d as any).raw ?? '—'}">
              <span class="{(d as any).score >= 90 ? 'text-acid' : (d as any).score >= 50 ? 'text-bone' : 'text-bone-dimmer'}">{(d as any).score.toFixed(0)}</span>
            </td>
          {/each}
        </tr>
      {/each}
    </tbody>
    </table>
  </div>

  <div class="brut-card-accent-green mb-8">
    <div class="brut-stat-label mb-1">RECOMMENDED</div>
    <div class="brut-stat-value text-acid">{data.recommended}</div>
  </div>

  <!-- Dev experience -->
  <div class="brut-eyebrow mb-2">DEV EXPERIENCE (1-5)</div>
  <div class="flex gap-4 mb-8">
    {#each data.scored as s}
      <label class="flex items-center gap-2 font-mono text-xs">
        <span style="color: {FRAMEWORK_COLOR[s.framework as any] ?? '#888'}">{s.framework}</span>
        <input type="number" min="1" max="5" step="1"
          onchange={(e) => saveDevScore(s.framework, Number((e.target as HTMLInputElement).value))}
          class="brut-input w-16" />
      </label>
    {/each}
  </div>

  <button onclick={handleExport} class="brut-btn-green">
    ↓ EXPORT MEMO.MD
  </button>
{:else}
  <div class="brut-card brut-hatch">
    <p class="font-mono text-sm text-bone-dim">No data for run #{data.runId} at c={data.concurrency}.</p>
  </div>
{/if}
