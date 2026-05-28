<script lang="ts">
  let { label, value, unit, accent = 'none' }: {
    label: string; value: string | number; unit?: string; accent?: 'green' | 'cyan' | 'none';
  } = $props();
</script>

<div class={accent === 'green' ? 'brut-card-accent-green' : accent === 'cyan' ? 'brut-card-accent-cyan' : 'brut-card'}>
  <div class="brut-stat-label mb-2">{label}</div>
  <div class="brut-stat-value">
    {value}{#if unit}<span class="brut-stat-label ml-2">{unit}</span>{/if}
  </div>
</div>
