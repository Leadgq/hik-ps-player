# 开发说明

本文面向维护本仓库的开发者。安装和接入说明见 `README.md`。

## 本地开发

仓库使用 pnpm workspace 和 Turborepo 管理核心及框架适配包。

```bash
pnpm install
pnpm dev
# React 示例
pnpm dev:react
```

## 构建和类型验证

```bash
pnpm build
pnpm test:types
```

`pnpm build` 先构建各包，再由 `scripts/collect-dist.mjs` 收集运行代码、类型声明和解码资源。发布前的 `prepublishOnly` 会执行构建。

源码使用 JavaScript，公开参数、返回值和配置类型通过 JSDoc 标注。核心、React、Vue2 使用 `tsc` 生成声明，Vue3 使用 `vue-tsc` 处理 `.vue` 文件。

公共类型统一维护在 `packages/core/src/types.js`，框架组件复用水印和 Props 类型。修改公开接口时，更新相应源码中的 JSDoc，无需手写 `.d.ts`。

声明先生成到各包的 `dist/types/`，再收集到根目录 `dist/types/`。根目录 `dist/index.d.ts`、`vue2.d.ts`、`vue3.d.ts`、`react.d.ts` 是生成的发布入口，辅助声明一并发布。不要直接编辑构建产物。

`pnpm test:types` 验证四个发布入口的解析、有效参数及无效参数，并分别在 Vue2、Vue3 类型环境中检查组件。运行前先执行 `pnpm build`。声明生成不等同于全量 JavaScript 类型检查，目前没有开启全项目 `checkJs`。
