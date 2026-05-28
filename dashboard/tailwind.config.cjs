/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{html,js,svelte,ts}'],
  theme: {
    extend: {
      colors: {
        ink: { DEFAULT: '#0a0a0a', 900: '#0a0a0a', 800: '#111111', 700: '#1a1a1a', 600: '#222222', 500: '#2d2d2d' },
        bone: { DEFAULT: '#f5f5f0', dim: '#c8c8c0', dimmer: '#8a8a82' },
        acid: { DEFAULT: '#5cff00', deep: '#39ff14' },
        zap: { DEFAULT: '#00f0ff', deep: '#00b8c8' },
        warn: { DEFAULT: '#ffe600' },
        bad: { DEFAULT: '#ff2e6c' },
        magenta: { DEFAULT: '#ff00d4' },
      },
      fontFamily: {
        mono: ['"JetBrains Mono"', 'ui-monospace', 'Menlo', 'monospace'],
        display: ['"Space Grotesk"', 'system-ui', 'sans-serif'],
        sans: ['"Space Grotesk"', 'system-ui', 'sans-serif'],
      },
      borderWidth: { 3: '3px', 5: '5px' },
      letterSpacing: { brut: '0.18em' },
      fontSize: {
        'display-xl': ['4.5rem', { lineHeight: '1', letterSpacing: '-0.02em' }],
        'display-lg': ['3.5rem', { lineHeight: '1.02', letterSpacing: '-0.02em' }],
        'display-md': ['2.25rem', { lineHeight: '1.05', letterSpacing: '-0.01em' }],
      },
    },
  },
  plugins: [],
};
