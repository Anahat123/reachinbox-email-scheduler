import type { Config } from 'tailwindcss';

// Tokens sampled from the Figma file.
export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
        logo: ['var(--font-logo)', 'monospace'],
      },
      colors: {
        ink: { DEFAULT: '#1C1C1C', muted: '#6B6B6B', faint: '#A3A3A3' },
        line: '#EDEDED',
        surface: { DEFAULT: '#F5F6F5', hover: '#EEF0EE' },
        brand: {
          50: '#EEF7F0',
          100: '#E3F2E6',
          200: '#BFE2C6',
          500: '#4CA754',
          600: '#3E9946',
          700: '#2F7D37',
        },
        pending: { bg: '#FDEBDC', border: '#F7CDAA', text: '#C0591A' },
        danger: { bg: '#FDECEC', text: '#C62828' },
      },
      boxShadow: {
        popover: '0 4px 24px rgba(0,0,0,0.08), 0 1px 3px rgba(0,0,0,0.06)',
      },
    },
  },
  plugins: [],
} satisfies Config;
