/** Tailwind: colores y fuentes corporativos para la interfaz enterprise. */
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: { sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'] },
      colors: {
        ink: '#13213a',
        canvas: '#f5f7fb',
        primary: { 50: '#eef4ff', 100: '#dce7ff', 500: '#526fea', 600: '#425bd0', 700: '#3447ab' },
        teal: { 50: '#eefbf8', 500: '#10a991', 600: '#0f8e7e' },
      },
      boxShadow: { panel: '0 8px 28px rgba(21, 41, 79, 0.045)', float: '0 18px 55px rgba(22, 38, 64, 0.16)' },
    }
  },
  plugins: [],
};
