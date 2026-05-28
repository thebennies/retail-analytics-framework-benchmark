export type Framework = 'fastapi' | 'fastify' | 'axum';

export const FRAMEWORK_COLOR: Record<Framework, string> = {
  fastapi: '#00f0ff', fastify: '#ff00d4', axum: '#5cff00',
};
export const FRAMEWORK_FILL: Record<Framework, string> = {
  fastapi: 'rgba(0, 240, 255, 0.12)',
  fastify: 'rgba(255, 0, 212, 0.12)',
  axum: 'rgba(92, 255, 0, 0.12)',
};

export const INK = '#0a0a0a';
export const BONE = '#f5f5f0';
export const BONE_DIM = '#8a8a82';

export function lineDatasetDefaults(fw: Framework) {
  return {
    borderColor: FRAMEWORK_COLOR[fw],
    backgroundColor: FRAMEWORK_FILL[fw],
    borderWidth: 3,
    pointRadius: 4,
    pointBackgroundColor: FRAMEWORK_COLOR[fw],
    pointBorderColor: INK,
    pointBorderWidth: 2,
    tension: 0,
    fill: false,
  };
}

export function barDatasetDefaults(fw: Framework) {
  return {
    backgroundColor: FRAMEWORK_COLOR[fw],
    borderColor: BONE,
    borderWidth: 2,
    borderSkipped: false as const,
  };
}

export const BRUTALIST_SCALE = {
  grid: { color: 'rgba(245,245,240,0.08)', drawTicks: true, lineWidth: 1 },
  border: { color: BONE, width: 3 },
  ticks: { color: BONE_DIM, font: { family: 'JetBrains Mono', size: 11, weight: 500 as const } },
  title: { color: BONE, font: { family: 'JetBrains Mono', size: 12, weight: 700 as const } },
};

export const BRUTALIST_LEGEND = {
  labels: {
    color: BONE,
    font: { family: 'JetBrains Mono', size: 12, weight: 700 as const },
    boxWidth: 18, boxHeight: 12, padding: 16, usePointStyle: false,
  },
};

export const BRUTALIST_TOOLTIP = {
  backgroundColor: INK,
  titleColor: '#5cff00',
  titleFont: { family: 'JetBrains Mono', size: 12, weight: 700 as const },
  bodyColor: BONE,
  bodyFont: { family: 'JetBrains Mono', size: 12 },
  borderColor: BONE,
  borderWidth: 2,
  padding: 12,
  cornerRadius: 0,
  displayColors: true,
};
