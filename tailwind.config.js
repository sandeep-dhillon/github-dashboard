/** @type {import('tailwindcss').Config} */
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: v("c-bg"),
        surface: v("c-surface"),
        surface2: v("c-surface-2"),
        border: v("c-border"),
        muted: v("c-muted"),
        text: v("c-text"),
        accent: v("c-accent"),
        accent2: v("c-accent-2"),
        success: v("c-success"),
        danger: v("c-danger"),
        warn: v("c-warn"),
        info: v("c-info"),
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui"],
        mono: ["JetBrains Mono", "ui-monospace", "SFMono-Regular"],
      },
      boxShadow: {
        glow: "0 0 0 1px rgb(var(--c-accent) / 0.4), 0 8px 30px rgb(var(--c-accent) / 0.18)",
      },
      keyframes: {
        pulseRing: {
          "0%": { boxShadow: "0 0 0 0 rgb(var(--c-accent) / 0.45)" },
          "100%": { boxShadow: "0 0 0 10px rgb(var(--c-accent) / 0)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-400px 0" },
          "100%": { backgroundPosition: "400px 0" },
        },
      },
      animation: {
        pulseRing: "pulseRing 1.6s ease-out infinite",
        shimmer: "shimmer 1.4s linear infinite",
      },
    },
  },
  plugins: [],
};
