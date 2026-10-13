<template>
  <div class="hik-ps" @click="player?.toggle()">
    <div ref="box" class="hik-ps__stage" />
    <p v-if="status" class="hik-ps__status">{{ status }}</p>
    <div class="hik-ps__timeline" @click.stop="onSeek">
      <div class="hik-ps__played" :style="{ width: played }" />
    </div>
    <div class="hik-ps__time">{{ formatTime(currentTime) }} / {{ duration ? formatTime(duration) : '--:--:--' }}</div>
  </div>
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { createHikPlayer } from '../core/player.js'

const props = defineProps({
  src: { type: String, default: '' },
  assetBase: { type: String, default: '/h265web/' },
})

const box = ref(null)
const status = ref('')
const currentTime = ref(0)
const duration = ref(0)
const played = ref('0%')
let player = null
let openToken = 0

function formatTime(sec) {
  const value = Math.max(0, Number(sec) || 0)
  const h = Math.floor(value / 3600)
  const m = Math.floor((value % 3600) / 60)
  const s = Math.floor(value % 60)
  return [h, m, s].map((n) => String(n).padStart(2, '0')).join(':')
}

function syncBar() {
  played.value = duration.value ? `${Math.min(100, (currentTime.value / duration.value) * 100)}%` : '0%'
}

async function open(url) {
  const token = ++openToken
  await player?.destroy()
  player = null
  if (!url || !box.value) return
  try {
    const next = await createHikPlayer({
      container: box.value,
      url,
      assetBase: props.assetBase,
      onStatus: (text) => {
        if (token === openToken) status.value = text
      },
      onTime: (state) => {
        if (token !== openToken) return
        currentTime.value = state.currentTime
        syncBar()
      },
      onDuration: (value) => {
        if (token !== openToken) return
        duration.value = value
        syncBar()
      },
    })
    if (token !== openToken) {
      await next.destroy()
      return
    }
    player = next
  } catch (error) {
    if (token === openToken) status.value = error?.message || '视频加载失败'
  }
}

function onSeek(event) {
  if (!player || !(duration.value > 0)) return
  const rect = event.currentTarget.getBoundingClientRect()
  const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width))
  player.seek(ratio * duration.value).catch((error) => {
    status.value = error?.message || '跳转失败'
  })
}

onMounted(() => open(props.src))
watch(() => props.src, (url) => open(url))

onBeforeUnmount(() => {
  openToken += 1
  player?.destroy()
  player = null
})
</script>

<style scoped>
.hik-ps {
  position: relative;
  width: 100%;
  background: #000;
  color: #fff;
}
.hik-ps__stage {
  width: 100%;
  height: 450px;
}
.hik-ps__status {
  position: absolute;
  left: 0;
  right: 0;
  top: 180px;
  margin: 0;
  text-align: center;
  pointer-events: none;
}
.hik-ps__timeline {
  height: 8px;
  margin: 12px 12px 0;
  background: #d9e6f2;
  border-radius: 4px;
  cursor: pointer;
}
.hik-ps__played {
  height: 100%;
  background: #3ba9ff;
}
.hik-ps__time {
  padding: 8px 12px 12px;
  text-align: right;
  font-size: 13px;
}
</style>
