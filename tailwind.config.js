/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx,js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Inter"', 'system-ui', 'sans-serif'],
      },
      colors: {
        hq: {
          teal: '#178a8a',
          tealDark: '#0f6d6d',
          tealLight: '#20b7b7',
          gray: '#F5F7FA',
          navy: '#0E1F2E',
        },
      },
      boxShadow: {
        soft: '0 10px 30px rgba(15, 30, 44, 0.08)',
      },
    },
  },
  plugins: [],
}
