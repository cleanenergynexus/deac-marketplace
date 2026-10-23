import type { Config } from "tailwindcss";
export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: { 50: "#eef6ff", 100: "#d9eaff", 500: "#1f6feb", 600: "#1859c4", 700: "#13479c", 900: "#0b1f3a" },
      },
    },
  },
  plugins: [],
} satisfies Config;
