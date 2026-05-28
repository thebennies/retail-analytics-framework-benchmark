<script lang="ts">
  import { fmtDate } from '$lib/format';

  let { data }: { data: any } = $props();

  let status: any = $state(null);
  let polling = $state(true);
  let error = $state('');

  async function poll() {
    try {
      const res = await fetch(`/api/runs/${data.runId}/status`);
      status = await res.json();
      if (status.status === 'completed' || status.status === 'failed') {
        polling = false;
      }
    } catch (e: any) {
      error = e.message;
    }
  }

  $effect(() => {
    if (!polling) return;
    poll();
    const interval = setInterval(poll, 2000);
    return () => clearInterval(interval);
  });

  let progressText = $derived(
    status?.progress
      ? `${status.progress.framework} / ${status.progress.endpoint} / c=${status.progress.concurrency} — ${status.progress.phase}`
      : 'Waiting...'
  );
</script>

<svelte:head><title>Run #{data.runId}</title></svelte:head>

<h1 class="text-2xl font-bold mb-4">Run #{data.runId}</h1>

{#if error}
  <div class="bg-red-900/30 border border-red-600 rounded p-3 mb-4 text-sm">{error}</div>
{/if}

{#if status}
  <div class="space-y-4">
    <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
      <div class="bg-slate-800 rounded p-3">
        <div class="text-xs text-slate-400 uppercase">Status</div>
        <div class="text-lg font-bold {status.status === 'running' ? 'text-cyan-400' : status.status === 'completed' ? 'text-green-400' : 'text-red-400'}">
          {status.status}
        </div>
      </div>
      <div class="bg-slate-800 rounded p-3">
        <div class="text-xs text-slate-400 uppercase">Results</div>
        <div class="text-lg font-bold">{status.latest_results_count}</div>
      </div>
      <div class="bg-slate-800 rounded p-3">
        <div class="text-xs text-slate-400 uppercase">Started</div>
        <div class="text-sm font-mono">{fmtDate(status.started_at)}</div>
      </div>
      <div class="bg-slate-800 rounded p-3">
        <div class="text-xs text-slate-400 uppercase">Current</div>
        <div class="text-sm">{progressText}</div>
      </div>
    </div>

    <!-- Log tail -->
    {#if status.last_log_lines?.length}
      <div class="bg-slate-900 rounded p-3">
        <div class="text-xs text-slate-400 uppercase mb-2">Log (last 20 lines)</div>
        <pre class="text-xs font-mono text-slate-300 overflow-x-auto max-h-64 overflow-y-auto">{status.last_log_lines.join('\n')}</pre>
      </div>
    {/if}

    {#if status.status === 'completed' || status.status === 'failed'}
      <div class="flex gap-4">
        <a href="/runs/{data.runId}" class="bg-cyan-600 hover:bg-cyan-500 px-6 py-2 rounded font-semibold text-white no-underline">
          View Results →
        </a>
        <a href="/run" class="bg-slate-700 hover:bg-slate-600 px-6 py-2 rounded font-semibold text-white no-underline">
          New Run
        </a>
      </div>
    {/if}
  </div>
{:else}
  <p class="text-slate-400">Loading...</p>
{/if}
