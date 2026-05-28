<script lang="ts">
  import { fmtDate, fmtInt } from '$lib/format';
  import type { RunWithHardware } from '$lib/db';

  let { data }: { data: { runs: RunWithHardware[] } } = $props();
</script>

<svelte:head><title>Benchmark Runs</title></svelte:head>

<h1 class="text-2xl font-bold mb-4">Benchmark Runs</h1>

{#if data.runs.length === 0}
  <p class="text-slate-400">No runs found. Run a benchmark first.</p>
{:else}
  <table>
    <thead>
      <tr>
        <th>ID</th>
        <th>Started</th>
        <th>CPU</th>
        <th>Cores</th>
        <th>RAM</th>
        <th>Results</th>
      </tr>
    </thead>
    <tbody>
      {#each data.runs as run}
        <tr>
          <td><a href="/runs/{run.id}">#{run.id}</a></td>
          <td class="font-mono text-xs">{fmtDate(run.started_at)}</td>
          <td class="text-xs">{run.cpu_model ?? '—'}</td>
          <td>{fmtInt(run.cpu_cores)}</td>
          <td>{fmtInt(run.total_ram_mb)} MB</td>
          <td>{run.result_count}</td>
        </tr>
      {/each}
    </tbody>
  </table>
{/if}
