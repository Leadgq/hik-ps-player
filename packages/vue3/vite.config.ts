import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    vue(),
    {
      name: 'inject-vue-css',
      apply: 'build',
      enforce: 'post',
      generateBundle: {
        order: 'post',
        handler(_options, bundle) {
          let css = ''
          for (const [name, item] of Object.entries(bundle)) {
            if (item.type === 'asset' && name.endsWith('.css')) {
              css += String(item.source)
              delete bundle[name]
            }
          }
          const entry = Object.values(bundle).find((item) => item.type === 'chunk' && item.isEntry)
          if (entry && css && entry.type === 'chunk') {
            entry.code =
              `const style = document.createElement('style');style.textContent=${JSON.stringify(css)};document.head.appendChild(style);\n` +
              entry.code
          }
        },
      },
    },
  ],
  build: {
    lib: {
      entry: 'src/index.js',
      formats: ['es'],
      fileName: 'index',
    },
    rollupOptions: {
      external: ['vue'],
      output: {
        entryFileNames: 'index.js',
      },
    },
    emptyOutDir: true,
  },
})
