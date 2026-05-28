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
  <div class="brut-table-wrap">
    <table class="brut-table-auto">
      <colgroup>
        <col style="width: 60px" />
        <col style="width: 180px" />
        <col />
        <col style="width: 80px" />
        <col style="width: 100px" />
        <col style="width: 160px" />
        <col style="width: 60px" />
      </colgroup>
      <thead>
        <tr>
          <th>ID</th>
          <th>DETECTED</th>
          <th>CPU</th>
          <th class="num">CORES</th>
          <th class="num">RAM MB</th>
          <th>KERNEL</th>
          <th class="num">RUNS</th>
        </tr>
      </thead>
      <tbody>
        {#each data.hardware as hw}
          <tr>
            <td>#{hw.id}</td>
            <td class="font-mono text-xs">{fmtDate(hw.detected_at)}</td>
            <td class="text-xs" title={hw.cpu_model ?? ''}>{(hw.cpu_model ?? '—').length > 35 ? (hw.cpu_model ?? '—').slice(0, 33) + '…' : (hw.cpu_model ?? '—')}</td>
            <td class="num">{hw.cpu_cores}/{hw.cpu_threads}</td>
            <td class="num">{(hw.total_ram_mb ?? 0).toLocaleString()}</td>
            <td class="font-mono text-xs">{hw.kernel_version ?? '—'}</td>
            <td class="num">{hw.run_count}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
{/if}
