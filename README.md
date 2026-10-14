# hik-ps-player

在浏览器中播放海康 IMKH / MPEG-PS 录像，支持按需读取和时间跳转，可接入 Vue 2、Vue 3、React，也可以单独使用播放器核心。

PS 录像在浏览器内拆包并使用 WASM 解码 H.265；普通 MP4 使用浏览器原生播放器。远程 PS 文件通过 HTTP Range 分段读取，跳转时保留原始 URL，可用于 MinIO 等存储服务的预签名链接。

## 安装

```bash
npm install hik-ps-player
# 或
pnpm add hik-ps-player
```

框架组件使用项目中已有的 Vue 或 React：Vue 2.6.14+（2.x）、Vue 3.4+、React 18 / 19。播放器核心不依赖这两个框架。

## 准备解码资源

将包内的 `h265web` **整个目录**复制到项目的静态资源目录。例如，Vite 项目放在 `public/h265web`：

```text
public/
└── h265web/
    ├── output/
    ├── ps-demux-worker.js
    ├── ps-remote-seek-worker.js
    └── …
```

可以手动复制，也可以在项目根目录执行以下命令（需要 Node.js）：

```bash
node --input-type=module -e "import { cpSync, mkdirSync } from 'node:fs'; mkdirSync('public', { recursive: true }); cpSync('node_modules/hik-ps-player/h265web', 'public/h265web', { recursive: true });"
```

启动应用后，确认 `/h265web/output/h265web.js` 和 `/h265web/ps-remote-seek-worker.js` 可访问。保留目录结构，升级包后同步更新这份资源。

默认资源地址为 `/h265web/`。如果应用部署在子路径，可以通过 `assetBase` 指定资源根目录，例如 `/my-app/h265web/`。

## 快速使用

以下示例中的 `/videos/record.ps` 请替换为实际录像地址，也可以使用完整的预签名 URL。播放器填满父容器，因此需要给父容器设置高度。

### Vue 3

```vue
<script setup>
import { HikPsVideo } from 'hik-ps-player/vue3'

const url = '/videos/record.ps'
</script>

<template>
  <div style="width: 100%; height: 500px">
    <HikPsVideo :src="url" />
  </div>
</template>
```

### Vue 2

```vue
<template>
  <div style="width: 100%; height: 500px">
    <HikPsVideo :src="url" />
  </div>
</template>

<script>
import { HikPsVideo } from 'hik-ps-player/vue2'

export default {
  components: { HikPsVideo },
  data() {
    return { url: '/videos/record.ps' }
  },
}
</script>
```

### React

```jsx
import { HikPsVideo } from 'hik-ps-player/react'

export function VideoPage() {
  const url = '/videos/record.ps'

  return (
    <div style={{ width: '100%', height: 500 }}>
      <HikPsVideo src={url} />
    </div>
  )
}
```

组件处理播放器的创建和销毁，并在 `src` 变化时加载新地址。点击进度条可跳转；左右方向键分别后退、前进 10 秒，在输入框中输入时不会触发。浏览器阻止自动播放时，点击播放按钮或画面开始播放。

### 组件参数

Vue 2、Vue 3、React 的组件都接受以下参数：

| 参数 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `src` | `string` | `''` | 录像地址；为空时不加载 |
| `assetBase` | `string` | `'/h265web/'` | 解码资源根目录 |
| `watermark` | `string \| HikWatermarkOption` | `''` | 平铺文字水印，支持播放中更新 |

Vue 模板中的 `assetBase` 可以写为 `asset-base`：

```vue
<HikPsVideo :src="url" asset-base="/my-app/h265web/" watermark="张三" />
```

## 水印

传入字符串即可显示平铺水印；传入对象可设置间距、字号和颜色：

```js
const watermark = {
  text: '张三 · 仅供内部查看',
  gap: 420,
  fontSize: 20,
  color: 'rgba(255,255,255,0.35)',
}
```

Vue 使用 `:watermark="watermark"`，React 使用 `watermark={watermark}`。

| 字段 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `text` | `string` | `''` | 水印文字，为空时不显示 |
| `gap` | `number` | `420` | 平铺间距，单位为像素 |
| `fontSize` | `number` | `20` | 字号，单位为像素 |
| `color` | `string` | `'rgba(255,255,255,0.35)'` | CSS 颜色 |

## 单独使用播放器核心

需要自定义播放界面或按钮时，可以直接调用 `createHikPlayer`。先将播放容器添加到页面，再创建实例：

```html
<div id="player" style="width: 100%; height: 500px"></div>
```

```js
import { createHikPlayer } from 'hik-ps-player'

const container = document.getElementById('player')
if (!container) throw new Error('找不到播放容器')

const player = await createHikPlayer({
  container,
  url: '/videos/record.ps',
  onStatus: (text) => console.log(text),
  onTime: ({ currentTime, duration, playing }) => {
    console.log({ currentTime, duration, playing })
  },
})

// 在自定义按钮事件中调用。
async function seekTo30Seconds() {
  await player.seek(30)
}

// 页面或组件卸载时调用，释放播放器和相关资源。
async function disposePlayer() {
  await player.destroy()
}
```

### 创建选项

| 选项 | 类型 | 说明 |
| --- | --- | --- |
| `container` | `HTMLElement` | 必填，已挂载到页面的播放容器 |
| `url` | `string` | 必填，录像地址 |
| `assetBase` | `string` | 解码资源根目录，默认 `/h265web/` |
| `watermark` | `string \| HikWatermarkOption` | 水印配置 |
| `onStatus` | `(text: string) => void` | 加载状态或错误提示；空字符串表示清除提示 |
| `onTime` | `(state: HikTimeState) => void` | 时间状态，包含 `currentTime`、`duration`、`playing` |
| `onDuration` | `(duration: number) => void` | 时长更新，单位为秒 |
| `onReady` | `() => void` | H.265 解码播放器首帧就绪时触发 |

`createHikPlayer` 返回 `Promise<HikPlayer>`。创建完成后，PS 的远程索引仍可能在加载；时长尚未就绪时跳转不会执行，远程定位尚未就绪时跳转可能失败。调用 `seek` 时应处理返回的 Promise。

### 实例接口

| 接口 | 说明 |
| --- | --- |
| `play()` | 开始播放；原生视频路径可能返回 Promise |
| `pause()` | 暂停播放 |
| `toggle()` | 切换播放 / 暂停 |
| `seek(seconds)` | 跳转到指定秒数，返回 Promise |
| `setWatermark(value)` | 更新水印；传空字符串或不传参数可清除 |
| `fitSurface()` | 按当前容器尺寸调整画面 |
| `destroy()` | 释放资源，返回 Promise；卸载时调用 |
| `currentTime` | 当前播放时间，单位为秒 |
| `duration` | 总时长，单位为秒；尚未获取时为 `0` |
| `playing` | 当前播放状态 |
| `isPs` | 是否使用 PS 播放路径 |

## TypeScript

包内包含类型声明，四个导入入口都提供类型提示。可以按需导入公共类型：

```ts
import type { HikPlayer, HikPlayerOptions, HikWatermark } from 'hik-ps-player'
import type { HikPsVideoProps } from 'hik-ps-player/react'
```

Vue 组件入口也导出 `HikPsVideoProps`。React 的 TypeScript 项目需要安装与项目 React 版本匹配的 `@types/react`。

## 远程录像与部署要求

播放远程 PS 文件时，视频服务器需要：

- 支持 HTTP Range 请求，返回 `206 Partial Content` 和有效的 `Content-Range`。
- 跨域访问时，通过 CORS 允许应用的来源和 `Range` 请求头，并通过 `Access-Control-Expose-Headers` 暴露 `Content-Range`。
- 使用预签名 URL 时，链接应在播放和后续跳转期间保持有效。HTTPS 页面应使用 HTTPS 视频地址。

普通 MP4 的格式和编码支持取决于浏览器。播放器使用 DOM、Worker 和 WebAssembly，应在浏览器端加载；SSR 项目请在客户端入口使用，避免在服务端直接导入或创建播放器。

## 常见问题

| 现象 | 检查项 |
| --- | --- |
| 播放器没有高度或看不到画面 | 父容器是否设置了明确高度 |
| 解码脚本、WASM 或 Worker 返回 404 | 是否复制完整的 `h265web` 目录；`assetBase` 是否与部署路径一致 |
| 录像请求返回 403 | 预签名 URL 是否过期，地址和访问权限是否正确 |
| 提示无法读取远程视频或 `Content-Range` | 网络是否正常，CORS 是否允许来源和 Range，并暴露响应头 |
| PS 无法跳转 | 服务端是否返回 206，远程索引是否已就绪 |
| 自动播放失败 | 点击播放按钮或画面，按浏览器要求通过用户交互开始播放 |

## License

[MIT](./LICENSE)
