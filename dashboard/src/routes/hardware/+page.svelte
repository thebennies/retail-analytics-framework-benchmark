<script lang="ts">
  import { fmtDate } from '$lib/format';
  import type { HardwareRun } from '$lib/db';

  let { data }: { data: { hardware: (HardwareRun & { run_count: number })[] } } = $props();
</script>

<svelte:head><title>Hardware</title></svelte:head>

<div class="brut-eyebrow mb-3">05 / HARDWARE</div>
<h1 class="brut-headline text-display-lg">Hardware</h1>
<hr class="brut-rule" />

{#if data.hardware.length === 0}
  <div class="brut-card brut-hatch">
    <p class="font-mono text-sm text-bone-dim">No hardware profiles recorded.</p>
  </div>
{:else}
  <table class="brut-table">
    <thead>
      <tr>
        <th>ID</th>
        <th>DETECTED</th>
        <th>CPU</th>
        <th class="num">CORES</th>
        <th class="num">RAM</th>
        <th>KERNEL</th>
        <th>RUNS</th>
      </tr>
    </thead>
    <tbody>
      {#each data.hardware as hw}
        <tr>
          <td>#{hw.id}</td>
          <td class="font-mono text-xs">{fmtDate(hw.detected_at)}</td>
          <td class="text-xs">{hw.cpu_model ?? '—'}</td>
          <td class="num">{hw.cpu_cores}/{hw.cpu_threads}</td>
          <td class="num">{hw.total_ram_mb?.toLocaleString() ?? '—'} MB</td>
          <td class="font-mono text-xs">{hw.kernel_version ?? '—'}</td>
          <td class="num">{hw.run_count}</td>
        </tr>
      {/each}
    </tbody>
  </table>
{/if}
