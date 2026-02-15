import { defineConfig } from 'vite'

export default defineConfig({
  base: '/canvas-graph/', // Replace with your actual repo name
  root: './',
  build: {
    outDir: 'dist',
    sourcemap: true
  },
  server: {
    port: 3000,
    open: false
  }
})
