/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    // Phase 1 fills this from src/styles/tokens.css. design.md is the source of truth.
    extend: {},
  },
  plugins: [],
}
