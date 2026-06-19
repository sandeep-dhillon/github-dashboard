import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// When deploying to GitHub Pages set VITE_BASE=/<repo-name>/.
// e.g. VITE_BASE=/pr-dashboard/ pnpm build
export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE || "/",
});
