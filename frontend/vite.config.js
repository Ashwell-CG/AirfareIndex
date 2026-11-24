import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vitest/config'

const backend = {
  '/api': {
    target: 'http://127.0.0.1:8000',
    changeOrigin: true,
    rewrite: (path) => path.replace(/^\/api/, ''),
  },
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 5173, host: true, proxy: backend },   // host: true -> reachable as localhost AND 127.0.0.1
  preview: { port: 4173, host: true, proxy: backend },     // `npm run preview` serves the production build with the same /api proxy
  // The WebGL hero chunk (three.js + react-three-fiber, ~250 kB gzip) is lazy-loaded on the landing page only.
  build: { chunkSizeWarningLimit: 1000 },
  test: { environment: 'jsdom', globals: true, setupFiles: './src/test/setup.js', css: false },
})
