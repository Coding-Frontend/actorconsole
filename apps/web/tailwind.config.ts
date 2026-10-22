import type { Config } from "tailwindcss";
import baseConfig from "@actorconsole/config/tailwind/tailwind.config";

const config: Config = {
  ...baseConfig,
  darkMode: "class",
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
    "./node_modules/@actorconsole/**/dist/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  plugins: [require("tailwindcss-animate")],
};

export default config;
