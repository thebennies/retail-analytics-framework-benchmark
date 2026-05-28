<script lang="ts">
  import { fmtDate } from '$lib/format';
  import type { RunWithHardware } from '$lib/db';

  let { data }: { data: { runs: RunWithHardware[] } } = $props();
</script>

<svelte:head><title>Benchmark Runs</title></svelte:head>

<div class="brut-eyebrow mb-3">01 / OVERVIEW</div>
<h1 class="brut-headline text-display-lg">Runs</h1>
<hr class="brut-rule" />

{#if data.runs.length === 0}
  <div class="brut-card brut-hatch">
    <p class="font-mono text-sm text-bone-dim">No runs found. Trigger one from /run.</p>
  </div>
{:else}
  <div class="brut-table-wrap">
    <table class="brut-table-auto">
      <colgroup>
        <col style="width: 60px" />
        <col style="width: 180px" />
        <col />
        <col style="width: 80px" />
        <col style="width: 100px" />
        <col style="width: 80px" />
      </colgroup>
      <thead>
        <tr>
          <th>ID</th>
          <th>STARTED</th>
          <th>CPU</th>
          <th class="num">CORES</th>
          <th class="num">RAM</th>
          <th class="num">RESULTS</th>
        </tr>
      </thead>
      <tbody>
        {#each data.runs as run}
          <tr>
            <td><a href="/runs/{run.id}" class="brut-link">#{run.id}</a></td>
            <td class="font-mono text-xs">{fmtDate(run.started_at)}</td>
            <td class="text-xs" title={run.cpu_model ?? ''}>{(run.cpu_model ?? '—').length > 40 ? (run.cpu_model ?? '—').slice(0, 38) + '…' : (run.cpu_model ?? '—')}</td>
            <td class="num">{run.cpu_cores ?? '—'}</td>
            <td class="num">{(run.total_ram_mb ?? 0).toLocaleString()}</td>
            <td class="num">{run.result_count}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
{/if}
