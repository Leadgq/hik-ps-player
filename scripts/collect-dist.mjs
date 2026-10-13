import { cpSync, mkdirSync, rmSync } from 'node:fs'

rmSync('dist', { recursive: true, force: true })
mkdirSync('dist', { recursive: true })

const files = [
  ['packages/core/dist/index.js', 'dist/index.js'],
  ['packages/vue2/dist/index.js', 'dist/vue2.js'],
  ['packages/vue3/dist/index.js', 'dist/vue3.js'],
  ['packages/react/dist/index.js', 'dist/react.js'],
]

for (const [from, to] of files) {
  cpSync(from, to)
}

cpSync('README.md', 'dist/README.md')
cpSync('assets/h265web', 'dist/h265web', { recursive: true })
