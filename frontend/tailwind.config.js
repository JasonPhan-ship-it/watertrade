/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
    "./pages/**/*.{js,ts,jsx,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        water: { 50: "#f0f9ff", 600: "#2563eb" },
        earth: { 50: "#fafaf9" }
      },
      borderRadius: { "2xl": "1rem" }
    }
  },
  plugins: []
};
