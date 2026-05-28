<script lang="ts">
  let { variant = 'default', href, type = 'button', disabled = false, onclick, children }: {
    variant?: 'default' | 'green' | 'cyan'; href?: string; type?: 'button' | 'submit';
    disabled?: boolean; onclick?: () => void; children?: any;
  } = $props();

  let cls = $derived(
    variant === 'green' ? 'brut-btn-green' : variant === 'cyan' ? 'brut-btn-cyan' : 'brut-btn'
  );
</script>

{#if href}
  <a {href} class={cls}>{@render children?.()}</a>
{:else}
  <button {type} {disabled} {onclick} class={cls}>{@render children?.()}</button>
{/if}
