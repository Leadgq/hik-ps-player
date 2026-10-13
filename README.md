# hik-ps-player

海康 IMKH + MPEG-PS 按需播放。浏览器内拆包、WASM 解 H.265，预签名 URL 用 Range 分段读取，跳转不改 URL。播放核心不依赖 Vue 或 React。

`assets/h265web` 是播放运行时（SDK、WASM、拆包和远端定位脚本）。`h265web-ps.js` 会按自己的地址去找上一级的 `ps-demux-worker.js`，这套目录不要拆开。把整个目录放到站点的 `/h265web/`。

## Vue 3

```vue
<script setup>
import { HikPsVideo } from 'hik-ps-player/vue3'
</script>

<template>
  <HikPsVideo :src="url" />
</template>
```

## Vue 2

```vue
<script>
import { HikPsVideo } from 'hik-ps-player/vue2'

export default {
  components: { HikPsVideo },
}
</script>

<template>
  <HikPsVideo :src="url" />
</template>
```

## React

```jsx
import { HikPsVideo } from 'hik-ps-player/react'

export function Page() {
  return <HikPsVideo src={url} />
}
```

也可以只拿播放器，自己画界面：

```js
import { createHikPlayer } from 'hik-ps-player'

const player = await createHikPlayer({
  container: document.querySelector('#player'),
  url,
})
player.toggle()
await player.seek(30)
player.destroy()
```

服务器需要 CORS，并允许 Range，响应 206，暴露 `Content-Range`。
