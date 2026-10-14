import { cpSync, mkdirSync, rmSync } from 'node:fs'

rmSync('dist', { recursive: true, force: true })
rmSync('h265web', { recursive: true, force: true })
mkdirSync('dist', { recursive: true })

const files = [
  ['packages/core/dist/index.js', 'dist/index.js'],
  ['packages/vue2/dist/index.js', 'dist/vue2.js'],
  ['packages/vue3/dist/index.js', 'dist/vue3.js'],
  ['packages/react/dist/index.js', 'dist/react.js'],
  ['types/index.d.ts', 'dist/index.d.ts'],
  ['types/vue2.d.ts', 'dist/vue2.d.ts'],
  ['types/vue3.d.ts', 'dist/vue3.d.ts'],
  ['types/react.d.ts', 'dist/react.d.ts'],
]

for (const [from, to] of files) {
  cpSync(from, to)
}

cpSync('assets/h265web', 'h265web', { recursive: true })
