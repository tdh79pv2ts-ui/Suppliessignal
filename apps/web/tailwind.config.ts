import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#17211d',
        canvas: '#f5f7f5',
        panel: '#ffffff',
        line: '#dfe5e1',
        signal: '#176b4d',
        muted: '#66746d',
      },
      boxShadow: { panel: '0 1px 2px rgba(23, 33, 29, 0.04), 0 8px 24px rgba(23, 33, 29, 0.04)' },
      fontFamily: { sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'] },
    },
  },
  plugins: [],
} satisfies Config;
