/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class", "[data-theme='dark']"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "rgb(var(--c-bg) / <alpha-value>)",
        surface: "rgb(var(--c-surface) / <alpha-value>)",
        surface2: "rgb(var(--c-surface2) / <alpha-value>)",
        line: "rgb(var(--c-line) / <alpha-value>)",
        ink: "rgb(var(--c-ink) / <alpha-value>)",
        muted: "rgb(var(--c-muted) / <alpha-value>)",
        brand: { DEFAULT: "#F38020", hover: "#DE6E0F", soft: "rgb(var(--c-brand-soft) / <alpha-value>)" },
        ok: "#15A350", err: "#D5393C", warn: "#B97D10", info: "#2563EB",
        sidebar: "rgb(var(--c-sidebar) / <alpha-value>)",
        "sidebar-ink": "rgb(var(--c-sidebar-ink) / <alpha-value>)",
      },
      fontFamily: { sans: "Inter, -apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif", mono: "'SF Mono', ui-monospace, Consolas, monospace" },
      boxShadow: { card: "0 1px 2px rgb(16 24 40 / 0.06), 0 1px 3px rgb(16 24 40 / 0.08)", pop: "0 8px 30px rgb(16 24 40 / 0.18)" },
      borderRadius: { xl2: "12px" },
    },
  },
  plugins: [],
};
