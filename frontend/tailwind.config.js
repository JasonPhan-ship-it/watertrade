/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
    "./pages/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    container: {
      center: true,
      padding: {
        DEFAULT: "1rem",
        sm: "1rem",
        lg: "2rem",
        xl: "2rem",
        "2xl": "2rem",
      },
    },
    extend: {
      // Extra breakpoints & max widths for large/ultrawide displays
      screens: {
        xs: "480px",
        "3xl": "1920px",
      },
      maxWidth: {
        "8xl": "96rem",   // 1536px
        "9xl": "112rem",  // 1792px
      },

      colors: {
        water: { 50: "#f0f9ff", 600: "#2563eb" },
        earth: { 50: "#fafaf9" },
      },
      borderRadius: { "2xl": "1rem" },
    },
  },
  plugins: [],
};
