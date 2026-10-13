<template>
  <div ref="root" class="hik-ps">
    <div ref="box" class="hik-ps__stage" />
    <p v-if="status" class="hik-ps__status">{{ status }}</p>
    <div class="hik-ps__timeline" @click.stop="onSeek">
      <div class="hik-ps__played" :style="{ width: played }" />
    </div>
    <div class="hik-ps__bar">
      <button type="button" class="hik-ps__icon" :title="playing ? '暂停' : '播放'" @click.stop="onToggle">
        <svg v-if="!playing" viewBox="0 0 24 24" aria-hidden="true">
          <path fill="currentColor" d="M8 5v14l11-7z" />
        </svg>
        <svg v-else viewBox="0 0 24 24" aria-hidden="true">
          <path fill="currentColor" d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
        </svg>
      </button>
      <button type="button" class="hik-ps__icon" :title="isFullscreen ? '退出全屏' : '全屏'" @click.stop="toggleFullscreen">
        <svg v-if="!isFullscreen" viewBox="0 0 24 24" aria-hidden="true">
          <path
            fill="currentColor"
            d="M7 14H5v5h5v-2H7v-3zm12 0h-2v3h-3v2h5v-5zM7 7h3V5H5v5h2V7zm7-2v2h3v3h2V5h-5z"
          />
        </svg>
        <svg v-else viewBox="0 0 24 24" aria-hidden="true">
          <path
            fill="currentColor"
            d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z"
          />
        </svg>
      </button>
      <div class="hik-ps__time">{{ formatTime(currentTime) }} / {{ duration ? formatTime(duration) : '--:--:--' }}</div>
    </div>
  </div>
</template>

<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { createHikPlayer } from '@hik-ps/core/player'

const props = defineProps({
  src: { type: String, default: '' },
  assetBase: { type: String, default: '/h265web/' },
})

const root = ref(null)
const box = ref(null)
const status = ref('')
const currentTime = ref(0)
const duration = ref(0)
const played = ref('0%')
const isFullscreen = ref(false)
const playing = ref(false)
let player = null
let openToken = 0
let fitTimer = 0

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
        playing.value = state.playing
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

function scheduleFit() {
  if (fitTimer) clearTimeout(fitTimer)
  nextTick(() => {
    requestAnimationFrame(() => player?.fitSurface())
    fitTimer = window.setTimeout(() => player?.fitSurface(), 80)
  })
}

function syncFullscreen() {
  isFullscreen.value = document.fullscreenElement === root.value
  scheduleFit()
}

function onToggle() {
  player?.toggle()
  playing.value = Boolean(player?.playing)
}

async function toggleFullscreen() {
  if (!root.value) return
  if (document.fullscreenElement === root.value) {
    await document.exitFullscreen()
    return
  }
  await root.value.requestFullscreen()
}

function onSeek(event) {
  if (!player || !(duration.value > 0)) return
  const rect = event.currentTarget.getBoundingClientRect()
  const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width))
  player.seek(ratio * duration.value).catch((error) => {
    status.value = error?.message || '跳转失败'
  })
}

onMounted(() => {
  open(props.src)
  document.addEventListener('fullscreenchange', syncFullscreen)
  window.addEventListener('resize', scheduleFit)
})
watch(() => props.src, (url) => open(url))

onBeforeUnmount(() => {
  document.removeEventListener('fullscreenchange', syncFullscreen)
  window.removeEventListener('resize', scheduleFit)
  if (fitTimer) clearTimeout(fitTimer)
  openToken += 1
  player?.destroy()
  player = null
})
</script>

<style scoped>
.hik-ps {
  display: flex;
  flex-direction: column;
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 0;
  background: #000;
  color: #fff;
}
.hik-ps__stage {
  position: relative;
  flex: 1;
  width: 100%;
  min-height: 0;
  overflow: hidden;
  background: #000;
}
.hik-ps__stage :deep(canvas),
.hik-ps__stage :deep(video) {
  position: absolute !important;
  inset: 0 !important;
  width: 100% !important;
  height: 100% !important;
  margin: 0 !important;
  object-fit: contain;
}
.hik-ps__status {
  position: absolute;
  left: 0;
  right: 0;
  top: 40%;
  transform: translateY(-50%);
  margin: 0;
  text-align: center;
  pointer-events: none;
}
.hik-ps__timeline {
  flex-shrink: 0;
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
.hik-ps__bar {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  padding: 8px 12px 12px;
}
.hik-ps__time {
  font-size: 13px;
}
.hik-ps__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 0;
  border-radius: 4px;
  color: #fff;
  background: transparent;
  cursor: pointer;
}
.hik-ps__icon svg {
  width: 22px;
  height: 22px;
}
.hik-ps__icon:hover {
  background: rgba(255, 255, 255, 0.12);
}
.hik-ps:fullscreen {
  width: 100%;
  height: 100%;
  background: #000;
}
</style>
