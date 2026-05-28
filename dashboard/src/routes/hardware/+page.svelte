<script lang="ts">
  import { fmtDate, fmtInt } from '$lib/format';
  import type { HardwareRun } from '$lib/db';

  let { data }: { data: { hardware: (HardwareRun & { run_count: number })[] } } = $props();
</script>

<svelte:head><title>Hardware</title></svelte:head>

<h1 class="text-2xl font-bold mb-4">Hardware Profiles</h1>

{#if data.hardware.length === 0}
  <p class="text-slate-400">No hardware profiles recorded.</p>
{:else}
  <table>
    <thead>
      <tr>
        <th>ID</th>
        <th>Detected</th>
        <th>CPU</th>
        <th>Cores / Threads</th>
        <th>RAM</th>
        <th>Kernel</th>
        <th>Docker</th>
        <th>Runs</th>
      </tr>
    </thead>
    <tbody>
      {#each data.hardware as hw}
        <tr>
          <td>#{hw.id}</td>
          <td class="font-mono text-xs">{fmtDate(hw.detected_at)}</td>
          <td class="text-xs">{hw.cpu_model ?? '—'}</td>
          <td>{hw.cpu_cores}/{hw.cpu_threads}</td>
          <td>{fmtInt(hw.total_ram_mb)} MB</td>
          <td class="font-mono text-xs">{hw.kernel_version ?? '—'}</td>
          <td class="font-mono text-xs">{hw.docker_version ?? '—'}</td>
          <td>{hw.run_count}</td>
        </tr>
      {/each}
    </tbody>
  </table>
{/if}
