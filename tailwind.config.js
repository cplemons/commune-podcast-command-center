/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        background: '#0d0a06',
        surface: '#1a1410',
        'surface-2': '#231c15',
        'surface-3': '#2d241a',
        border: '#3d3025',
        accent: '#c4622d',
        'accent-light': '#e07840',
        'text-primary': '#f5e6d3',
        'text-secondary': '#a89070',
        'text-muted': '#6b5840',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['Playfair Display', 'Georgia', 'serif'],
      },
    },
  },
  plugins: [],
};
