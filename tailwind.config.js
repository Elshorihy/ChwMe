/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: { extend: { fontFamily: { sans: ['Cairo', 'IBM Plex Sans Arabic', 'system-ui', 'sans-serif'] } } },
  plugins: []
};
