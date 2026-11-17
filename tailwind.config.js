/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        inno: {
          bg: '#07111F',
          deep: '#050D19',
          surface: '#091625',
          card: '#0B1A2C',
          border: '#142C46',
          cyan: '#00E1FF',
          cyanMid: '#00C4FF',
          blue: '#197FFF',
          blueBright: '#049FFF',
          text: '#F4F8FF',
          muted: '#8AA2BE',
          dim: '#55708E',
        },
      },
      fontFamily: {
        display: ['"Orbitron"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        sans: ['"Inter"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      boxShadow: {
        cyanGlow: '0 0 28px rgba(0, 225, 255, 0.25), 0 0 8px rgba(25, 127, 255, 0.2)',
        cyanStrong: '0 0 40px rgba(0, 225, 255, 0.4), 0 0 14px rgba(25, 127, 255, 0.35)',
        hud: '0 14px 50px rgba(0, 0, 0, 0.55), inset 0 1px 0 rgba(0, 225, 255, 0.08)',
      },
      animation: {
        marquee: 'marquee 32s linear infinite',
        pulseSlow: 'pulse 3.5s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        scanline: 'scanline 6s linear infinite',
      },
      keyframes: {
        marquee: {
          '0%': { transform: 'translateX(0%)' },
          '100%': { transform: 'translateX(-50%)' },
        },
        scanline: {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(100%)' },
        },
      },
    },
  },
  plugins: [],
};
