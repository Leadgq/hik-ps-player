import { createHikPlayer } from './player.js'

const STYLE = `
hik-ps-player { display: block; width: 100%; height: 100%; color: #fff; }
.hik-ps { display: flex; flex-direction: column; position: relative; width: 100%; height: 100%; min-height: 0; background: #000; }
.hik-ps__stage { position: relative; flex: 1; width: 100%; min-height: 0; overflow: hidden; background: #000; }
.hik-ps__status {
  position: absolute; left: 0; right: 0; top: 40%; transform: translateY(-50%); margin: 0;
  text-align: center; pointer-events: none;
}
.hik-ps__timeline {
  flex-shrink: 0; height: 8px; margin: 12px 12px 0; background: #d9e6f2;
  border-radius: 4px; cursor: pointer;
}
.hik-ps__played { height: 100%; background: #3ba9ff; }
.hik-ps__time { flex-shrink: 0; padding: 8px 12px 12px; text-align: right; font-size: 13px; }
`

function formatTime(sec) {
  const value = Math.max(0, Number(sec) || 0)
  const h = Math.floor(value / 3600)
  const m = Math.floor((value % 3600) / 60)
  const s = Math.floor(value % 60)
  return [h, m, s].map((n) => String(n).padStart(2, '0')).join(':')
}

/**
 * <hik-ps-player src="..." asset-base="/h265web/"></hik-ps-player>
 * 不依赖 Vue。把 assets/h265web 放到站点可访问的 /h265web/。
 */
export class HikPsPlayerElement extends HTMLElement {
  static get observedAttributes() {
    return ['src', 'asset-base', 'watermark']
  }

  constructor() {
    super()
    // 画面容器必须在文档里，SDK 用 getElementById 找它
    this.innerHTML = `
      <style>${STYLE}</style>
      <div class="hik-ps">
        <div class="hik-ps__stage"></div>
        <p class="hik-ps__status" hidden></p>
        <div class="hik-ps__timeline"><div class="hik-ps__played"></div></div>
        <div class="hik-ps__time">00:00:00 / --:--:--</div>
      </div>
    `
    this.stage = this.querySelector('.hik-ps__stage')
    this.statusEl = this.querySelector('.hik-ps__status')
    this.playedEl = this.querySelector('.hik-ps__played')
    this.timeEl = this.querySelector('.hik-ps__time')
    this.player = null
    this.openToken = 0
    this.currentTime = 0
    this.duration = 0
    this.stage.addEventListener('click', () => this.player?.toggle())
    this.querySelector('.hik-ps__timeline').addEventListener('click', (event) => {
      event.stopPropagation()
      this.seekAt(event)
    })
  }

  get src() {
    return this.getAttribute('src') || ''
  }

  set src(value) {
    if (value) this.setAttribute('src', value)
    else this.removeAttribute('src')
  }

  get assetBase() {
    return this.getAttribute('asset-base') || '/h265web/'
  }

  set assetBase(value) {
    this.setAttribute('asset-base', value || '/h265web/')
  }

  get watermark() {
    return this.getAttribute('watermark') || ''
  }

  set watermark(value) {
    if (value) this.setAttribute('watermark', typeof value === 'string' ? value : JSON.stringify(value))
    else this.removeAttribute('watermark')
  }

  connectedCallback() {
    this.open(this.src)
  }

  disconnectedCallback() {
    this.openToken += 1
    const player = this.player
    this.player = null
    player?.destroy()
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (!this.isConnected || oldValue === newValue) return
    if (name === 'src' || name === 'asset-base') this.open(this.src)
    if (name === 'watermark') this.player?.setWatermark(this.watermark)
  }

  syncBar() {
    const ratio = this.duration ? Math.min(100, (this.currentTime / this.duration) * 100) : 0
    this.playedEl.style.width = `${ratio}%`
    this.timeEl.textContent = `${formatTime(this.currentTime)} / ${this.duration ? formatTime(this.duration) : '--:--:--'}`
  }

  setStatus(text) {
    this.statusEl.hidden = !text
    this.statusEl.textContent = text || ''
  }

  async open(url) {
    const token = ++this.openToken
    await this.player?.destroy()
    if (token !== this.openToken) return
    this.player = null
    this.currentTime = 0
    this.duration = 0
    this.syncBar()
    if (!url) return
    try {
      const next = await createHikPlayer({
        container: this.stage,
        url,
        assetBase: this.assetBase,
        watermark: this.watermark,
        onStatus: (text) => {
          if (token === this.openToken) this.setStatus(text)
        },
        onTime: (state) => {
          if (token !== this.openToken) return
          this.currentTime = state.currentTime
          this.syncBar()
        },
        onDuration: (value) => {
          if (token !== this.openToken) return
          this.duration = value
          this.syncBar()
        },
      })
      if (token !== this.openToken) {
        await next.destroy()
        return
      }
      this.player = next
    } catch (error) {
      if (token === this.openToken) this.setStatus(error?.message || '视频加载失败')
    }
  }

  seekAt(event) {
    if (!this.player || !(this.duration > 0)) return
    const rect = event.currentTarget.getBoundingClientRect()
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width))
    this.player.seek(ratio * this.duration).catch((error) => {
      this.setStatus(error?.message || '跳转失败')
    })
  }
}

if (!customElements.get('hik-ps-player')) {
  customElements.define('hik-ps-player', HikPsPlayerElement)
}
