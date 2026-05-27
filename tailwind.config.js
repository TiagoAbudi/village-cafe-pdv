/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        cafe: {
          dark: '#2C221E',
          primary: '#4A3B32',
          secondary: '#C89F7C',
          bg: '#F9F6F0',
          card: '#FFFFFF'
        }
      }
    },
  },
  plugins: [],
}