import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'

rmSync('dist', { recursive: true, force: true })
rmSync('h265web', { recursive: true, force: true })
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

// 保留声明的相对目录，确保 .vue.d.ts 和公共类型也随包发布。
for (const name of ['core', 'vue2', 'vue3', 'react']) {
  const target = `dist/types/${name}`
  cpSync(`packages/${name}/dist/types`, target, { recursive: true })
  rewriteWorkspaceImports(target)
  const entry = name === 'core' ? 'index' : name
  writeFileSync(`dist/${entry}.d.ts`, `export * from './types/${name}/index.js'\n`)
}

function rewriteWorkspaceImports(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) rewriteWorkspaceImports(path)
    else if (entry.name.endsWith('.d.ts')) {
      const source = readFileSync(path, 'utf8')
      // 这些私有 workspace 包不会发布，统一指向随包生成的核心声明。
      const core = relative(dirname(path), 'dist/types/core/index.js').replaceAll('\\', '/')
      writeFileSync(path, source.replace(/(['"])@hik-ps\/core(?:\/player)?\1/g, (_match, quote) => `${quote}${core.startsWith('.') ? core : `./${core}`}${quote}`))
    }
  }
}

cpSync('assets/h265web', 'h265web', { recursive: true })
