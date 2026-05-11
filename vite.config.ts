import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  build: {
    // Three.js / R3F / drei / postprocessing dominate the bundle (~1 MB).
    // Splitting them into their own vendor chunk lets the browser
    // long-cache them across content changes — every redeploy stops
    // invalidating the heavy 3D libs.
    rolldownOptions: {
      output: {
        manualChunks: (id) => {
          if (!id.includes('node_modules')) return undefined;
          if (
            id.includes('/three/') ||
            id.includes('@react-three') ||
            id.includes('postprocessing') ||
            id.includes('/n8ao/') ||
            id.includes('3d-tiles-renderer')
          ) return 'vendor-three';
          if (id.includes('/react-router') || id.includes('/react-dom/') || id.match(/\/react\//)) {
            return 'vendor-react';
          }
          if (id.includes('framer-motion')) return 'vendor-motion';
          return undefined;
        },
      },
    },
  },
})
