<script lang="ts">
  import { DIMENSION_LABELS, type Dimension } from '$lib/scoring';
  import { colorFor } from '$lib/colors';
  import { fmtFloat } from '$lib/format';

  let { data }: { data: any } = $props();

  async function recompute(params: Record<string, string>) {
    const u = new URL(window.location.href);
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
    window.location.search = u.searchParams.toString();
  }

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
</script>

<svelte:head><title>Decision</title></svelte:head>

<h1 class="text-2xl font-bold mb-4">Decision Framework</h1>

<div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
  <label class="text-sm">
    Run:
    <select class="bg-slate-800 text-white px-2 py-1 rounded text-sm w-full"
      value={data.runId}
      onchange={(e) => recompute({ runId: (e.target as HTMLSelectElement).value })}>
      {#each data.runs as run}
        <option value={run.id}>#{run.id} — {run.cpu_model?.slice(0, 30) ?? 'Unknown'} ({run.result_count} results)</option>
      {/each}
    </select>
  </label>

  <label class="text-sm">
    Concurrency:
    <select class="bg-slate-800 text-white px-2 py-1 rounded text-sm w-full"
      value={data.concurrency}
      onchange={(e) => recompute({ concurrency: (e.target as HTMLSelectElement).value })}>
      {#each data.concLevels as c}
        <option value={c}>c={c}</option>
      {/each}
      {#if data.concLevels.length === 0}
        <option value={10}>c=10</option>
      {/if}
    </select>
  </label>
</div>

{#if data.scored.length > 0}
  <h2 class="text-lg font-semibold mb-2">Weighted Scores (default weights)</h2>
  <table class="mb-6">
    <thead>
      <tr>
        <th>Framework</th>
        <th class="text-right">Total</th>
        {#each Object.keys(DIMENSION_LABELS) as dim}
          <th class="text-right text-xs">{(DIMENSION_LABELS as any)[dim]}</th>
        {/each}
      </tr>
    </thead>
    <tbody>
      {#each data.scored as s, i}
        <tr class="{i === 0 ? 'bg-cyan-900/20' : ''}">
          <td class="font-bold" style="color: {colorFor(s.framework)}">{s.framework}</td>
          <td class="text-right font-bold">{s.weighted_total.toFixed(1)}</td>
          {#each Object.entries(s.dimensions) as [dim, d]}
            <td class="text-right font-mono text-xs">{(d as any).score.toFixed(0)} <span class="text-slate-600">({(d as any).raw ?? '—'})</span></td>
          {/each}
        </tr>
      {/each}
    </tbody>
  </table>

  <div class="bg-green-900/20 border border-green-600 rounded p-3 mb-6">
    <strong>Recommended:</strong> <span class="font-bold" style="color: {colorFor(data.recommended)}">{data.recommended}</span>
  </div>

  <!-- Dev experience inputs -->
  <h2 class="text-lg font-semibold mb-2">Dev Experience (1-5)</h2>
  <div class="flex gap-4 mb-6 flex-wrap">
    {#each data.scored as s}
      {@const fw = s.framework}
      <label class="text-sm flex items-center gap-2">
        <span style="color: {colorFor(fw)}">{fw}</span>
        <input type="number" min="1" max="5" step="1"
          onchange={(e) => saveDevScore(fw, Number((e.target as HTMLInputElement).value))}
          class="bg-slate-800 text-white px-2 py-1 rounded text-sm w-16" />
      </label>
    {/each}
  </div>

  <button onclick={handleExport}
    class="bg-cyan-600 hover:bg-cyan-500 px-6 py-2 rounded font-semibold text-white">
    Export Decision Memo (.md)
  </button>
{:else}
  <p class="text-slate-400">No data for run #{data.runId} at c={data.concurrency}. Try different parameters.</p>
{/if}
