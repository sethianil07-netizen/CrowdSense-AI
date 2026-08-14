import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // Increase chunk size warning to tolerate larger bundles during build
    chunkSizeWarningLimit: 2000,
  },
})
