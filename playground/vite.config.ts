import path from 'node:path'
import { fileURLToPath } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

const playgroundRoot = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  root: playgroundRoot,
  plugins: [vue()],
  publicDir: path.resolve(playgroundRoot, '../assets'),
  server: {
    port: 5188,
    host: '127.0.0.1',
    fs: {
      allow: [path.resolve(playgroundRoot, '..')],
    },
  },
})
