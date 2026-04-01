import type { Config } from "tailwindcss"
const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        mono: ["Space Mono", "monospace"],
        syne: ["Syne", "sans-serif"],
      },
      colors: {
        pyth: {
          purple: "#7c3aed",
          green: "#00ff88",
          yellow: "#fbbf24",
          red: "#ef4444",
        },
      },
    },
  },
  plugins: [],
}
export default config
