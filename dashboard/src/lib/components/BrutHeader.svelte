<script lang="ts">
  let { eyebrow, title, subtitle, size = 'lg' }: {
    eyebrow?: string; title: string; subtitle?: string; size?: 'lg' | 'xl';
  } = $props();
</script>

<header class="mb-8">
  {#if eyebrow}<div class="brut-eyebrow mb-3">{eyebrow}</div>{/if}
  <h1 class="brut-headline {size === 'xl' ? 'text-display-xl' : 'text-display-lg'}">{title}</h1>
  {#if subtitle}<p class="font-mono text-bone-dim mt-4 max-w-3xl text-sm leading-relaxed">{subtitle}</p>{/if}
  <hr class="brut-rule" />
</header>
