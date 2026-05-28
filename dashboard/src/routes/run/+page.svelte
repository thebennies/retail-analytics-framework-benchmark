<script lang="ts">
  import { colorFor } from '$lib/colors';

  let { data }: { data: any } = $props();

  let selectedFrameworks: string[] = $state([...data.frameworks]);
  let selectedEndpoints: string[] = $state([...data.endpoints]);
  let selectedConcurrency: number[] = $state([10]);
  let submitting = $state(false);
  let error = $state('');

  let allEndpoints = $derived(selectedEndpoints.length === data.endpoints.length);
  let estSeconds = $derived(
    selectedFrameworks.length * selectedEndpoints.length * selectedConcurrency.length * 85
  );
  let estMin = $derived(Math.round(estSeconds / 60));

  function toggleEndpoint(ep: string) {
    selectedEndpoints = selectedEndpoints.includes(ep)
      ? selectedEndpoints.filter((e: string) => e !== ep)
      : [...selectedEndpoints, ep];
  }

  async function handleSubmit() {
    submitting = true;
    error = '';
    try {
      const res = await fetch('/api/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          frameworks: selectedFrameworks,
          endpoints: selectedEndpoints,
          concurrency: selectedConcurrency,
        }),
      });
      const body = await res.json();
      if (res.ok) {
        window.location.href = `/run/${body.run_id}`;
      } else {
        error = body.error || `HTTP ${res.status}`;
      }
    } catch (e: any) {
      error = e.message;
    } finally {
      submitting = false;
    }
  }
</script>

<svelte:head><title>Run Benchmark</title></svelte:head>

<h1 class="text-2xl font-bold mb-4">Run Benchmark</h1>

{#if data.activeRun}
  <div class="bg-amber-900/30 border border-amber-600 rounded p-3 mb-4 text-sm">
    ⚠️ A benchmark is already running (run_id={data.activeRun.runId}).
    <a href="/run/{data.activeRun.runId}" class="text-cyan-400">View status →</a>
  </div>
{/if}

<form onsubmit={(e) => { e.preventDefault(); handleSubmit(); }} class="space-y-6">
  <!-- Frameworks -->
  <div>
    <h2 class="text-lg font-semibold mb-2">Frameworks</h2>
    <div class="flex gap-4 flex-wrap">
      {#each data.frameworks as fw}
        <label class="inline-flex items-center gap-2">
          <input type="checkbox" bind:group={selectedFrameworks} value={fw} />
          <span style="color: {colorFor(fw)}">{fw}</span>
        </label>
      {/each}
    </div>
  </div>

  <!-- Endpoints -->
  <div>
    <h2 class="text-lg font-semibold mb-2">Endpoints</h2>
    <label class="inline-flex items-center gap-2 mb-2 text-sm text-slate-400">
      <input type="checkbox" checked={allEndpoints} onchange={() => {
        selectedEndpoints = allEndpoints ? [] : [...data.endpoints];
      }} />
      Select all
    </label>
    <div class="grid grid-cols-2 md:grid-cols-3 gap-2">
      {#each data.endpoints as ep}
        <label class="inline-flex items-center gap-2 text-sm">
          <input type="checkbox" checked={selectedEndpoints.includes(ep)}
            onchange={() => toggleEndpoint(ep)} />
          <span class="font-mono">{ep}</span>
        </label>
      {/each}
    </div>
  </div>

  <!-- Concurrency -->
  <div>
    <h2 class="text-lg font-semibold mb-2">Concurrency levels</h2>
    <div class="flex gap-3 flex-wrap">
      {#each data.concurrencyLevels as c}
        <label class="inline-flex items-center gap-2">
          <input type="checkbox" bind:group={selectedConcurrency} value={c} />
          <span class="font-mono">{c}</span>
        </label>
      {/each}
    </div>
  </div>

  <!-- Estimate -->
  <div class="bg-slate-800 rounded p-3 text-sm">
    <strong>{selectedFrameworks.length} × {selectedEndpoints.length} × {selectedConcurrency.length}</strong>
    = {selectedFrameworks.length * selectedEndpoints.length * selectedConcurrency.length} combos
    · estimated <strong>{estMin} min</strong>
  </div>

  {#if error}
    <div class="bg-red-900/30 border border-red-600 rounded p-3 text-sm">{error}</div>
  {/if}

  <button
    type="submit"
    disabled={submitting || !selectedFrameworks.length || !selectedEndpoints.length || !selectedConcurrency.length}
    class="bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed px-6 py-2 rounded font-semibold text-white"
  >
    {submitting ? 'Starting...' : 'Run Benchmark'}
  </button>
</form>
