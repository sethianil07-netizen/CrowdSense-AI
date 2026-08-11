/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: "#0B1220",
          panel: "#131C2E",
          border: "#22314A",
          raised: "#182339",
        },
        signal: {
          safe: "#2BD576",
          caution: "#F2B44D",
          critical: "#FF5568",
          live: "#4FD1FF",
        },
        text: {
          primary: "#EAF0F7",
          muted: "#7C8AA3",
          faint: "#4A5A78",
        },
      },
      fontFamily: {
        display: ["'Space Grotesk'", "sans-serif"],
        body: ["'Inter'", "sans-serif"],
        mono: ["'JetBrains Mono'", "monospace"],
      },
      keyframes: {
        scanline: {
          "0%": { transform: "translateY(-100%)" },
          "100%": { transform: "translateY(100vh)" },
        },
        "sonar-ping": {
          "0%": { transform: "scale(0.3)", opacity: "0.9" },
          "100%": { transform: "scale(2.6)", opacity: "0" },
        },
        "pulse-glow": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.45" },
        },
        "flow-dash": {
          to: { strokeDashoffset: "-24" },
        },
      },
      animation: {
        scanline: "scanline 6s linear infinite",
        "sonar-ping": "sonar-ping 2.2s cubic-bezier(0,0,0.2,1) infinite",
        "pulse-glow": "pulse-glow 1.8s ease-in-out infinite",
        "flow-dash": "flow-dash 1s linear infinite",
      },
    },
  },
  plugins: [],
}

