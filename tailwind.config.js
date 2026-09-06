/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        critical: '#ef4444',
        high: '#f97316',
        standard: '#3b82f6',
      }
    },
  },
  plugins: [],
}
