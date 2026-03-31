import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // ── Brand ──────────────────────────────────────────────────────────────
        brand: {
          50:  '#EFF6FF',
          100: '#DBEAFE',
          200: '#BFDBFE',
          300: '#93C5FD',
          400: '#60A5FA',
          500: '#3B82F6',
          600: '#2563EB',
          700: '#1D4ED8',
          800: '#1E40AF',
          900: '#1E3A8A',
        },
        // ── Dark execution surface ─────────────────────────────────────────────
        navy: {
          700: '#1B2E4E',
          800: '#1B2A4A',
          900: '#0F1B30',
          950: '#080E1A',
        },
        // ── Execution canvas ──────────────────────────────────────────────────
        canvas: {
          50:  '#F8F9FB',
          100: '#111827',   // dark bg
          200: '#161D2E',   // sidebar bg
          300: '#1C2333',   // card bg
          400: '#232C40',   // border/divider
        },
        // ── Status semantic colors ────────────────────────────────────────────
        status: {
          pending:    '#94A3B8',   // slate-400
          ready:      '#60A5FA',   // blue-400
          dispatched: '#A78BFA',   // violet-400
          active:     '#F59E0B',   // amber-500
          review:     '#818CF8',   // indigo-400
          qa:         '#C084FC',   // purple-400
          blocked:    '#F87171',   // red-400
          failed:     '#EF4444',   // red-500
          completed:  '#34D399',   // emerald-400
          cancelled:  '#6B7280',   // gray-500
        },
        // ── Health indicators ─────────────────────────────────────────────────
        health: {
          healthy:  '#22C55E',
          degraded: '#F59E0B',
          incident: '#EF4444',
        },
        // ── Extended slate ────────────────────────────────────────────────────
        slate: {
          25: '#F8FAFC',
        },
      },
      fontFamily: {
        sans:  ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono:  ['JetBrains Mono', 'Fira Code', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.625rem', { lineHeight: '0.875rem' }],
      },
      spacing: {
        '4.5': '1.125rem',
        '13':  '3.25rem',
        '15':  '3.75rem',
        '18':  '4.5rem',
        '30':  '7.5rem',
        '60':  '15rem',
        '72':  '18rem',
        '84':  '21rem',
        '96':  '24rem',
      },
      width: {
        sidebar:      '240px',
        'sidebar-sm': '64px',
      },
      maxWidth: {
        sidebar: '240px',
      },
      height: {
        topbar:    '48px',
        'topbar-lg': '56px',
      },
      borderRadius: {
        '4xl': '2rem',
      },
      animation: {
        'pulse-slow':  'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'fade-in':     'fadeIn 0.15s ease-out',
        'slide-up':    'slideUp 0.2s ease-out',
        'highlight':   'highlight 2s ease-out forwards',
      },
      keyframes: {
        fadeIn: {
          '0%':   { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%':   { transform: 'translateY(8px)', opacity: '0' },
          '100%': { transform: 'translateY(0)',   opacity: '1' },
        },
        highlight: {
          '0%':   { backgroundColor: 'rgba(250, 204, 21, 0.3)' },
          '100%': { backgroundColor: 'transparent' },
        },
      },
      boxShadow: {
        'execution': '0 0 0 1px rgba(59,130,246,0.2), 0 4px 24px rgba(0,0,0,0.4)',
        'card-dark': '0 1px 3px rgba(0,0,0,0.3), 0 0 0 1px rgba(255,255,255,0.04)',
      },
    },
  },
  plugins: [],
}

export default config
