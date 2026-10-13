import path from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const playgroundRoot = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  root: playgroundRoot,
  plugins: [react()],
  publicDir: path.resolve(playgroundRoot, '../assets'),
  optimizeDeps: {
    exclude: ['@hik-ps/react', '@hik-ps/core'],
  },
  server: {
    port: 5189,
    host: '127.0.0.1',
    fs: {
      allow: [path.resolve(playgroundRoot, '..')],
    },
  },
})
