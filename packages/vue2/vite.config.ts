import { defineConfig } from 'vite'

// Vue 2 组件是 render 函数，不经过 Vue 3 的 SFC 编译。
// 以后如果这里改成 .vue 单文件，只在这个包加上 @vitejs/plugin-vue2。
export default defineConfig({
  build: {
    lib: {
      entry: 'src/index.js',
      formats: ['es'],
      fileName: 'index',
    },
    rollupOptions: {
      output: {
        entryFileNames: 'index.js',
      },
    },
    emptyOutDir: true,
  },
})
