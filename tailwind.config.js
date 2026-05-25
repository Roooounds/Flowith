/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        boss: {
          bg: "#0f1117",
          surface: "#1a1d27",
          "surface-hover": "#242838",
          border: "#2a2e3a",
          "border-active": "#4a4f5e",
          accent: "#6366f1",
          "accent-hover": "#818cf8",
          success: "#22c55e",
          warning: "#f59e0b",
          error: "#ef4444",
          text: "#e2e4e9",
          "text-muted": "#8b8fa3",
        },
      },
      fontFamily: {
        sans: [
          "Inter",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
        mono: ["JetBrains Mono", "Fira Code", "monospace"],
      },
      borderRadius: {
        node: "12px",
        panel: "16px",
      },
    },
  },
  plugins: [],
};
