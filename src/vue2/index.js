import { createHikPlayer } from '../core/player.js'

const STYLE = `
.hik-ps-vue2 { position: relative; width: 100%; background: #000; color: #fff; }
.hik-ps-vue2__stage { width: 100%; height: 450px; }
.hik-ps-vue2__status {
  position: absolute; left: 0; right: 0; top: 180px; margin: 0;
  text-align: center; pointer-events: none;
}
.hik-ps-vue2__timeline {
  height: 8px; margin: 12px 12px 0; background: #d9e6f2;
  border-radius: 4px; cursor: pointer;
}
.hik-ps-vue2__played { height: 100%; background: #3ba9ff; }
.hik-ps-vue2__time { padding: 8px 12px 12px; text-align: right; font-size: 13px; }
`

function formatTime(sec) {
  const value = Math.max(0, Number(sec) || 0)
  const hours = Math.floor(value / 3600)
  const minutes = Math.floor((value % 3600) / 60)
  const seconds = Math.floor(value % 60)
  return [hours, minutes, seconds].map((n) => String(n).padStart(2, '0')).join(':')
}

export const HikPsVideo = {
  name: 'HikPsVideo',
  props: {
    src: { type: String, default: '' },
    assetBase: { type: String, default: '/h265web/' },
  },
  data() {
    return {
      status: '',
      currentTime: 0,
      duration: 0,
      openToken: 0,
    }
  },
  created() {
    this.player = null
  },
  mounted() {
    this.open(this.src)
  },
  beforeDestroy() {
    this.openToken += 1
    const player = this.player
    this.player = null
    player?.destroy()
  },
  watch: {
    src(url) {
      this.open(url)
    },
    assetBase() {
      this.open(this.src)
    },
  },
  methods: {
    async open(url) {
      const token = ++this.openToken
      await this.player?.destroy()
      if (token !== this.openToken) return
      this.player = null
      this.currentTime = 0
      this.duration = 0
      if (!url || !this.$refs.box) return
      try {
        const next = await createHikPlayer({
          container: this.$refs.box,
          url,
          assetBase: this.assetBase,
          onStatus: (text) => {
            if (token === this.openToken) this.status = text
          },
          onTime: (state) => {
            if (token !== this.openToken) return
            this.currentTime = state.currentTime
          },
          onDuration: (value) => {
            if (token !== this.openToken) return
            this.duration = value
          },
        })
        if (token !== this.openToken) {
          await next.destroy()
          return
        }
        this.player = next
      } catch (error) {
        if (token === this.openToken) this.status = error?.message || '视频加载失败'
      }
    },
    onSeek(event) {
      if (!this.player || !(this.duration > 0)) return
      const rect = event.currentTarget.getBoundingClientRect()
      const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width))
      this.player.seek(ratio * this.duration).catch((error) => {
        this.status = error?.message || '跳转失败'
      })
    },
  },
  render(h) {
    const played = this.duration ? `${Math.min(100, (this.currentTime / this.duration) * 100)}%` : '0%'
    return h('div', {
      class: 'hik-ps-vue2',
      on: { click: () => this.player?.toggle() },
    }, [
      h('style', STYLE),
      h('div', { class: 'hik-ps-vue2__stage', ref: 'box' }),
      this.status ? h('p', { class: 'hik-ps-vue2__status' }, this.status) : null,
      h('div', {
        class: 'hik-ps-vue2__timeline',
        on: {
          click: (event) => {
            event.stopPropagation()
            this.onSeek(event)
          },
        },
      }, [
        h('div', { class: 'hik-ps-vue2__played', style: { width: played } }),
      ]),
      h('div', { class: 'hik-ps-vue2__time' }, `${formatTime(this.currentTime)} / ${this.duration ? formatTime(this.duration) : '--:--:--'}`),
    ])
  },
}
