<script lang="ts">
  import { fmtDate } from '$lib/format';

  let { data }: { data: { runId: number } } = $props();

  let status = $state<any>(null);
  let polling = $state(true);
  let useSSE = $state(true);
  let eventSource: EventSource | null = null;

  async function pollOnce() {
    try {
      const res = await fetch(`/api/runs/${data.runId}/status`);
      status = await res.json();
      if (status.status === 'completed' || status.status === 'failed') {
        polling = false;
      }
    } catch { /* retry next cycle */ }
  }

  function startSSE() {
    try {
      eventSource = new EventSource(`/api/runs/${data.runId}/stream`);
      eventSource.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          status = { ...status, ...data };
          if (data.status === 'completed' || data.status === 'failed') {
            eventSource?.close();
            polling = false;
            // Final poll for complete data
            pollOnce();
          }
        } catch {}
      };
      eventSource.onerror = () => {
        eventSource?.close();
        useSSE = false;
        startPolling();
      };
    } catch {
      useSSE = false;
      startPolling();
    }
  }

  function startPolling() {
    pollOnce();
    const interval = setInterval(async () => {
      await pollOnce();
      if (!polling) clearInterval(interval);
    }, 2000);
  }

  $effect(() => {
    if (typeof EventSource !== 'undefined') {
      startSSE();
    } else {
      useSSE = false;
      startPolling();
    }
  });

  let progressText = $derived(
    status?.progress
      ? `${status.progress.framework} / ${status.progress.endpoint} / c=${status.progress.concurrency} — ${status.progress.phase}`
      : 'Waiting...'
  );
</script>

<svelte:head><title>Run #{data.runId}</title></svelte:head>

<div class="brut-eyebrow mb-3">04 / LIVE STATUS</div>
<h1 class="brut-headline text-display-lg">Run #{data.runId}</h1>
<div class="font-mono text-xs text-bone-dimmer mb-2">{useSSE ? 'SSE' : 'POLL 2s'}</div>
<hr class="brut-rule" />

{#if status}
  <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
    <div class="brut-card">
      <div class="brut-stat-label mb-1">STATUS</div>
      <div class="font-mono font-bold text-xl {status.status === 'running' ? 'text-zap' : status.status === 'completed' ? 'text-acid' : 'text-bad'}">
        {status.status}
      </div>
    </div>
    <div class="brut-card">
      <div class="brut-stat-label mb-1">RESULTS</div>
      <div class="brut-stat-value">{status.latest_results_count}</div>
    </div>
    <div class="brut-card">
      <div class="brut-stat-label mb-1">STARTED</div>
      <div class="font-mono text-sm">{fmtDate(status.started_at)}</div>
    </div>
    <div class="brut-card">
      <div class="brut-stat-label mb-1">CURRENT</div>
      <div class="font-mono text-sm">{progressText}</div>
    </div>
  </div>

  {#if status.last_log_lines?.length}
    <div class="brut-card mb-8">
      <div class="brut-eyebrow mb-2">LOG TAIL</div>
      <pre class="font-mono text-xs text-bone-dim overflow-x-auto max-h-64 overflow-y-auto">{status.last_log_lines.join('\n')}</pre>
    </div>
  {/if}

  {#if status.status === 'completed' || status.status === 'failed'}
    <div class="flex gap-4">
      <a href="/runs/{data.runId}" class="brut-btn-green">VIEW RESULTS →</a>
      <a href="/run" class="brut-btn-cyan">NEW RUN</a>
    </div>
  {/if}
{:else}
  <div class="brut-card brut-hatch">
    <div class="font-mono text-sm text-bone-dim">Connecting...</div>
  </div>
{/if}
