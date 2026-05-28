<script lang="ts">
  import { FRAMEWORK_COLOR } from '$lib/charts/palette';

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

<div class="brut-eyebrow mb-3">04 / TRIGGER</div>
<h1 class="brut-headline text-display-lg">Run</h1>
<hr class="brut-rule" />

{#if data.activeRun}
  <div class="brut-card-accent-green mb-6">
    <span class="text-warn font-mono text-sm">⚠ RUN IN PROGRESS (#{data.activeRun.runId})</span>
    <a href="/run/{data.activeRun.runId}" class="brut-link text-sm ml-4">VIEW →</a>
  </div>
{/if}

<form onsubmit={(e) => { e.preventDefault(); handleSubmit(); }} class="space-y-8">
  <!-- Frameworks -->
  <div>
    <div class="brut-eyebrow mb-2">FRAMEWORKS</div>
    <div class="flex gap-4 flex-wrap">
      {#each data.frameworks as fw}
        <label class="inline-flex items-center gap-2 font-mono text-sm">
          <input type="checkbox" bind:group={selectedFrameworks} value={fw} />
          <span style="color: {FRAMEWORK_COLOR[fw as any] ?? '#888'}">{fw}</span>
        </label>
      {/each}
    </div>
  </div>

  <!-- Endpoints -->
  <div>
    <div class="brut-eyebrow mb-2">ENDPOINTS</div>
    <label class="inline-flex items-center gap-2 mb-2 font-mono text-xs text-bone-dim">
      <input type="checkbox" checked={allEndpoints} onchange={() => {
        selectedEndpoints = allEndpoints ? [] : [...data.endpoints];
      }} />
      SELECT ALL
    </label>
    <div class="grid grid-cols-2 md:grid-cols-3 gap-2">
      {#each data.endpoints as ep}
        <label class="inline-flex items-center gap-2 font-mono text-xs">
          <input type="checkbox" checked={selectedEndpoints.includes(ep)}
            onchange={() => toggleEndpoint(ep)} />
          {ep}
        </label>
      {/each}
    </div>
  </div>

  <!-- Concurrency -->
  <div>
    <div class="brut-eyebrow mb-2">CONCURRENCY</div>
    <div class="flex gap-3 flex-wrap">
      {#each data.concurrencyLevels as c}
        <label class="inline-flex items-center gap-2 font-mono text-sm">
          <input type="checkbox" bind:group={selectedConcurrency} value={c} />
          {c}
        </label>
      {/each}
    </div>
  </div>

  <!-- Estimate -->
  <div class="brut-card">
    <span class="font-mono text-sm">
      {selectedFrameworks.length} × {selectedEndpoints.length} × {selectedConcurrency.length}
      = <span class="text-acid font-bold">{selectedFrameworks.length * selectedEndpoints.length * selectedConcurrency.length}</span> combos
      · est <span class="text-zap font-bold">{estMin} min</span>
    </span>
  </div>

  {#if error}
    <div class="brut-card" style="border-color: #ff2e6c;">
      <span class="text-bad font-mono text-sm">{error}</span>
    </div>
  {/if}

  <button
    type="submit"
    disabled={submitting || !selectedFrameworks.length || !selectedEndpoints.length || !selectedConcurrency.length}
    class="brut-btn-green"
  >
    {submitting ? 'STARTING...' : '▶ RUN BENCHMARK'}
  </button>
</form>
