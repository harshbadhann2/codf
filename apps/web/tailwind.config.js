/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Space Grotesk"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace']
      },
      colors: {
        line: 'var(--line)',
        card: 'var(--card)',
        ink: 'var(--text-main)',
        muted: 'var(--text-muted)'
      },
      boxShadow: {
        panel: '0 15px 45px -20px rgba(15, 23, 42, 0.35)',
        lift: '0 8px 24px -12px rgba(15, 23, 42, 0.3)'
      },
      keyframes: {
        rise: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' }
        },
        shimmer: {
          '0%': { backgroundPosition: '-500px 0' },
          '100%': { backgroundPosition: '500px 0' }
        }
      },
      animation: {
        rise: 'rise 350ms ease-out',
        shimmer: 'shimmer 1.6s linear infinite'
      }
    }
  },
  plugins: []
};
