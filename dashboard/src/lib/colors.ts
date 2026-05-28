// Placeholder palette. Phase 3d replaces with neo-brutalism accent set.
export const FRAMEWORK_COLORS: Record<string, string> = {
  fastapi: '#3b82f6', // blue
  fastify: '#22c55e', // green
  axum: '#f97316' // orange
};

export function colorFor(fw: string): string {
  return FRAMEWORK_COLORS[fw] ?? '#a78bfa'; // violet fallback
}
