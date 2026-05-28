<script lang="ts">
  import '../app.css';
  import { page } from '$app/state';

  type NavItem = { href: string; label: string };

  const nav: NavItem[] = [
    { href: '/', label: 'Runs' },
    { href: '/compare', label: 'Compare' },
    { href: '/hardware', label: 'Hardware' },
    { href: '/run', label: 'Run' },
  ];

  function isActive(href: string): boolean {
    const p = page.url.pathname;
    return href === '/' ? p === '/' : p.startsWith(href);
  }

  let { children }: { children: () => any } = $props();
</script>

<nav class="flex items-center gap-6 px-6 py-3 border-b border-slate-800 bg-slate-900/60">
  <a href="/" class="text-lg font-bold text-white no-underline mr-4">⏱ Bench</a>
  {#each nav as item}
    <a
      href={item.href}
      class="text-sm no-underline {isActive(item.href) ? 'text-white font-semibold' : 'text-slate-400 hover:text-white'}"
    >
      {item.label}
    </a>
  {/each}
</nav>

<main class="max-w-7xl mx-auto px-6 py-6">
  {@render children()}
</main>
