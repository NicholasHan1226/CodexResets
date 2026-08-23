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
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // Eager vendor chunks only. Data access stays behind the Worker, so
          // no database client is shipped on the first-paint critical path.
          'vendor-react': ['react', 'react-dom', 'react-router'],
          'vendor-ui': ['@radix-ui/react-slot', 'class-variance-authority', 'clsx', 'tailwind-merge'],
        },
        // Optimize chunk naming for caching
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
      },
    },
    // Enable minification
    minify: 'esbuild',
    // Source maps for production (optional, can be disabled for smaller builds)
    sourcemap: false,
    // Target modern browsers for smaller bundle
    target: 'es2020',
  },
});
