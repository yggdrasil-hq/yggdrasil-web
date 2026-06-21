import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        niflheim: "#080B11",
        surface: {
          DEFAULT: "#0E131B",
          "01": "#0E131B",
          "02": "#151C26",
          "03": "#1C2531",
        },
        rime: { DEFAULT: "#2A3543", soft: "#1F2937" },
        frost: "#E8EEF4",
        mist: "#9FB0C0",
        shadow: "#5E6E7E",
        bifrost: "#2FD4C6",
        aurora: "#4F9BF0",
        frostfire: "#BFE9EE",
        status: {
          draft: "#6B7A8A",
          ready: "#2FD4C6",
          progress: "#4F9BF0",
          input: "#E2A13C",
          "review-agent": "#9B8CF0",
          review: "#5BC0E8",
          approved: "#46C285",
          rejected: "#E06C75",
          failed: "#C84A52",
        },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      maxWidth: {
        content: "1200px",
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        card: "14px",
        panel: "16px",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
