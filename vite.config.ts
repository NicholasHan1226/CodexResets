import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    port: Number(process.env.DEPLOY_RUN_PORT) || 5000,
    host: '0.0.0.0',
  },
  preview: {
    port: Number(process.env.DEPLOY_RUN_PORT) || 5000,
    host: '0.0.0.0',
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
