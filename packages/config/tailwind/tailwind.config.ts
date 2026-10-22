import type { Config } from "tailwindcss";

/**
 * ActorConsole design system.
 *
 * Analytics console on parchment. Warm-gray Mist canvas, white Paper
 * cards, Carbon text, Signal Orange as the single data accent.
 * PolySans substitute (Space Grotesk) for display, Inter for body.
 *
 * All named palette colors reference CSS custom properties defined
 * in globals.css (:root / .dark) so dark mode works automatically.
 */

export default {
  content: [],
  theme: {
    extend: {
      colors: {
        // ── ActorConsole palette (CSS-variable backed) ──────
        signal: {
          DEFAULT: "var(--color-signal-orange)",
          orange: "var(--color-signal-orange)",
          blue: "var(--color-signal-blue)",
          green: "var(--color-signal-green)",
        },
        sienna: {
          DEFAULT: "var(--color-sienna-bronze)",
          bronze: "var(--color-sienna-bronze)",
        },
        carbon: {
          DEFAULT: "var(--color-carbon)",
        },
        graphite: {
          DEFAULT: "var(--color-graphite)",
        },
        slate: {
          DEFAULT: "var(--color-slate)",
        },
        fog: {
          DEFAULT: "var(--color-fog)",
        },
        mist: {
          DEFAULT: "var(--color-mist)",
        },
        chalk: {
          DEFAULT: "var(--color-chalk)",
        },
        paper: {
          DEFAULT: "var(--color-paper)",
          cream: "var(--color-paper)",
        },
        ink: {
          DEFAULT: "var(--color-ink)",
        },
        // shadcn aliases mapped to the ActorConsole palette
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
        // legacy brand keys collapsed to ActorConsole equivalents
        // so non-home pages (auth, dashboard, admin) still typecheck.
        brand: {
          50: "var(--color-mist)",
          100: "var(--color-fog)",
          200: "var(--color-chalk)",
          300: "var(--color-slate)",
          400: "var(--color-slate)",
          500: "var(--color-carbon)",
          600: "var(--color-carbon)",
          700: "var(--color-carbon)",
          800: "var(--color-carbon)",
          900: "var(--color-carbon)",
          950: "var(--color-carbon)",
        },
        warm: {
          border: "var(--color-chalk)",
        },
        stone: {
          DEFAULT: "var(--color-graphite)",
          gray: "var(--color-graphite)",
        },
        ash: {
          DEFAULT: "var(--color-slate)",
          gray: "var(--color-slate)",
        },
      },
      fontFamily: {
        // Distinctive editorial display face for product and marketing headings.
        display: [
          '"Bricolage Grotesque"',
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "BlinkMacSystemFont",
          '"Segoe UI"',
          "Roboto",
          "sans-serif",
        ],
        // IBM Plex Sans keeps product copy technical without feeling sterile.
        sans: [
          '"IBM Plex Sans"',
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "BlinkMacSystemFont",
          '"Segoe UI"',
          "Roboto",
          "sans-serif",
        ],
        mono: ['"IBM Plex Mono"', "ui-monospace", "monospace"],
      },
      fontSize: {
        // ActorConsole type scale (see DESIGN.md)
        caption: ["12px", { lineHeight: "18px" }],
        body: ["16px", { lineHeight: "22px" }],
        "body-lg": ["18px", { lineHeight: "24px" }],
        subheading: ["32px", { lineHeight: "38px", letterSpacing: "-0.64px" }],
        heading: ["40px", { lineHeight: "45px", letterSpacing: "-0.8px" }],
        display: ["66px", { lineHeight: "60px", letterSpacing: "-1.32px" }],
        // legacy sizes
        "body-sm": ["14px", { lineHeight: "20px" }],
        "heading-sm": ["32px", { lineHeight: "38px", letterSpacing: "-0.64px" }],
        "display-sm": ["40px", { lineHeight: "45px", letterSpacing: "-0.8px" }],
        "display-md": ["48px", { lineHeight: "54px", letterSpacing: "-0.96px" }],
        lead: ["18px", { lineHeight: "24px" }],
      },
      fontWeight: {
        regular: "400",
        medium: "500",
        semibold: "600",
      },
      backgroundImage: {
        // legacy gradient alias — collapses to no-op so old call sites
        // don't paint purple anywhere.
        "brand-gradient": "none",
        "brand-gradient-subtle": "none",
        "grid-light":
          "linear-gradient(to right, rgba(0,0,0,0.04) 1px, transparent 1px), linear-gradient(to bottom, rgba(0,0,0,0.04) 1px, transparent 1px)",
      },
      boxShadow: {
        // ActorConsole: subtle 1-3% opacity shadows only.
        card: "0 1px 3px rgba(32,32,32,0.04), 0 4px 12px rgba(32,32,32,0.03)",
        "card-hover": "0 1px 3px rgba(32,32,32,0.06), 0 8px 20px rgba(32,32,32,0.04)",
        panel: "0 1px 3px rgba(32,32,32,0.04), 0 4px 12px rgba(32,32,32,0.03)",
        glow: "0 0 30px -10px rgba(255, 104, 44, 0.25)",
        sm: "0 1px 2px rgba(32,32,32,0.04)",
        // Keep legacy depth utilities on the same restrained studio scale.
        lg: "0 1px 3px rgba(32,32,32,0.04), 0 8px 20px rgba(32,32,32,0.035)",
        xl: "0 1px 3px rgba(32,32,32,0.05), 0 10px 24px rgba(32,32,32,0.04)",
        "2xl": "0 1px 3px rgba(32,32,32,0.06), 0 12px 28px rgba(32,32,32,0.045)",
        DEFAULT: "0 1px 3px rgba(32,32,32,0.04)",
      },
      borderRadius: {
        // ActorConsole uses one compact workbench radius for surfaces and
        // controls; full remains available for semantic pills and avatars.
        DEFAULT: "3px",
        sm: "3px",
        md: "3px",
        lg: "3px",
        xl: "3px",
        "2xl": "3px",
        "3xl": "3px",
        full: "200px",
        // legacy aliases
        section: "3px",
        panel: "3px",
      },
      keyframes: {
        "fade-in-up": {
          "0%": { opacity: "0", transform: "translateY(20px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        "scale-in": {
          "0%": { opacity: "0", transform: "scale(0.96)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
      },
      animation: {
        "fade-in-up": "fade-in-up 0.6s ease-out forwards",
        "fade-in": "fade-in 0.5s ease-out forwards",
        "scale-in": "scale-in 0.4s ease-out forwards",
      },
    },
  },
} satisfies Config;
