<script lang="ts">
  import '../app.css';
  import { page } from '$app/state';

  const nav = [
    { href: '/', label: '01 / RUNS' },
    { href: '/compare', label: '02 / COMPARE' },
    { href: '/decision', label: '03 / DECISION' },
    { href: '/run', label: '04 / TRIGGER' },
    { href: '/hardware', label: '05 / HW' },
  ];

  let { children }: { children: () => any } = $props();
</script>

<div class="min-h-screen bg-ink-900 text-bone flex">
  <aside class="w-64 shrink-0 border-r-3 border-bone bg-ink-900 p-6 flex flex-col gap-8">
    <div>
      <div class="brut-eyebrow mb-2">BENCHMARK / INTERNAL</div>
      <div class="font-display font-bold text-2xl leading-tight uppercase">
        Sales<br>Stack<br>Bench<span class="text-acid">.</span>
      </div>
    </div>
    <nav class="flex flex-col gap-1">
      {#each nav as item}
        {@const active = page.url.pathname === item.href || (item.href !== '/' && page.url.pathname.startsWith(item.href))}
        <a href={item.href}
          class="font-mono uppercase tracking-brut text-xs px-3 py-3 border-l-3 transition-colors
            {active ? 'border-acid bg-ink-800 text-acid' : 'border-transparent text-bone-dim hover:text-bone hover:border-bone'}">
          {item.label}
        </a>
      {/each}
    </nav>
    <div class="mt-auto font-mono text-xs text-bone-dimmer">
      <div>v0.1.0 / phase-3d</div>
      <div class="mt-1">localhost-only</div>
    </div>
  </aside>
  <main class="flex-1 px-10 py-10 overflow-y-auto">
    {@render children()}
  </main>
</div>
