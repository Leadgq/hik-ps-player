import { resolveAssetPaths } from './paths.js'
import { inspectRemoteContainer } from './container.js'
import { createH265Player, h265BuildOptions } from './sdk.js'

/**
 * 打开一个海康 PS / 普通 MP4 地址。
 * PS 按 Range 分段读取，跳转不改预签名 URL。
 */
export function createHikPlayer(options) {
  const player = new HikPlayer(options)
  return player.open().then(() => player)
}

class HikPlayer {
  constructor({ container, url, assetBase = '/h265web/', onTime, onDuration, onStatus, onReady } = {}) {
    if (!container) throw new Error('缺少播放容器')
    if (!url) throw new Error('缺少视频地址')
    this.container = container
    this.url = url
    this.assetBase = assetBase
    this.onTime = onTime
    this.onDuration = onDuration
    this.onStatus = onStatus
    this.onReady = onReady
    this.playerId = `hik-ps-${Math.random().toString(36).slice(2, 10)}`
    this.paths = resolveAssetPaths(assetBase)
    this.isPs = false
    this.duration = 0
    this.currentTime = 0
    this.playing = false
    this.remoteReady = false
    this.token = 0
    this.playbackBase = 0
    this.loadingFirstFrame = false
    this.h265 = null
    this.mediaEl = null
    this.clockTimer = 0
    this.remoteWorker = null
    this.remoteRequestId = 0
    this.remotePending = new Map()
    this.seeking = false
  }

  emitStatus(text) {
    this.onStatus?.(text || '')
  }

  emitTime() {
    this.onTime?.({ currentTime: this.currentTime, duration: this.duration, playing: this.playing })
  }

  async open() {
    await this.destroyPlayer()
    const token = ++this.token
    this.currentTime = 0
    this.duration = 0
    this.emitTime()
    this.emitStatus('正在识别视频格式…')
    const container = await inspectRemoteContainer(this.url)
    if (token !== this.token) return this
    this.isPs = container.isPs
    this.ensureSurface()
    if (container.isPs) {
      this.emitStatus('海康录像按需加载中…')
      this.startRemoteIndex(this.url)
      await this.mountH265(token, this.url, true)
    } else {
      this.mountNative(token, this.url)
    }
    return this
  }

  ensureSurface() {
    this.container.innerHTML = ''
    const surface = document.createElement('div')
    surface.id = this.playerId
    surface.style.cssText = 'position:relative;width:100%;height:100%;background:#000;'
    this.container.appendChild(surface)
    this.surface = surface
  }

  mountNative(token, url) {
    if (token !== this.token || !this.surface) return
    const video = document.createElement('video')
    video.src = url
    video.playsInline = true
    video.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:contain;background:#000;'
    this.surface.appendChild(video)
    this.mediaEl = video
    video.addEventListener('loadedmetadata', () => {
      if (token !== this.token) return
      this.duration = Number(video.duration) || 0
      this.onDuration?.(this.duration)
      this.emitTime()
    })
    video.addEventListener('timeupdate', () => {
      if (token !== this.token) return
      this.currentTime = video.currentTime || 0
      this.emitTime()
    })
    video.addEventListener('play', () => {
      if (token === this.token) this.playing = true
    })
    video.addEventListener('pause', () => {
      if (token === this.token) this.playing = false
    })
    this.emitStatus('')
    video.play().catch(() => this.emitStatus('点击画面开始播放'))
  }

  async mountH265(token, url, ps, options = {}) {
    if (token !== this.token || !this.surface) return
    this.surface.innerHTML = ''
    const player = await createH265Player(ps, this.assetBase)
    if (token !== this.token) {
      player.release?.(() => {})
      return
    }
    this.h265 = player
    this.playbackBase = options.baseTime || 0
    this.currentTime = this.playbackBase
    this.loadingFirstFrame = true
    this.emitTime()
    if (ps) this.startClock()
    player.on_ready_show_done_callback = () => {
      if (token !== this.token) return
      this.loadingFirstFrame = false
      this.emitStatus('')
      this.onReady?.()
      if (options.resume === false) {
        this.playing = false
        this.syncClock()
        return
      }
      try {
        player.play()
        this.playing = true
        this.syncClock()
      } catch {
        this.emitStatus('点击画面开始播放')
      }
    }
    player.on_play_time = (seconds) => {
      if (token !== this.token) return
      this.currentTime = this.playbackBase + (Number(seconds) || 0)
      this.emitTime()
      this.syncClock()
    }
    player.on_play_finished = () => {
      if (token !== this.token) return
      this.playing = false
      this.loadingFirstFrame = false
      this.syncClock()
      this.emitStatus('播放结束')
    }
    player.on_error_callback = (err) => {
      if (token !== this.token) return
      this.playing = false
      this.emitStatus('播放错误：' + (typeof err === 'string' ? err : err?.message || JSON.stringify(err)))
    }
    player.build({
      ...h265BuildOptions(this.playerId, this.assetBase),
      ...(ps ? { format_type: 'mpeg' } : {}),
    })
    player._ps_start_offset = options.startOffset || 0
    player.load_media(url)
  }

  toggle() {
    if (this.mediaEl) {
      if (this.mediaEl.paused) this.mediaEl.play().catch(() => {})
      else this.mediaEl.pause()
      return
    }
    if (!this.h265) return
    if (this.playing) this.pause()
    else this.play()
  }

  play() {
    if (this.mediaEl) return this.mediaEl.play()
    this.h265?.play()
    this.playing = true
    this.syncClock()
  }

  pause() {
    if (this.mediaEl) return this.mediaEl.pause()
    this.h265?.pause()
    this.playing = false
    this.syncClock()
  }

  async seek(seconds) {
    if (!(this.duration > 0) || this.seeking) return
    const target = Math.max(0, Math.min(this.duration - 0.1, Number(seconds) || 0))
    if (!this.isPs) {
      if (this.mediaEl) this.mediaEl.currentTime = target
      return
    }
    if (!this.remoteReady || !this.h265) throw new Error('远程定位尚未就绪')
    const previous = this.h265
    const tokenAtStart = this.token
    const resume = this.playing
    this.seeking = true
    try {
      previous.pause()
      this.playing = false
      this.syncClock()
      const result = await this.remoteRequest('seek', { time: target })
      if (this.token !== tokenAtStart || this.h265 !== previous) return
      await this.destroyPlayer({ keepRemote: true, bumpToken: false })
      if (this.token !== tokenAtStart) return
      const token = ++this.token
      this.ensureSurface()
      await this.mountH265(token, this.url, true, {
        startOffset: result.key.offset,
        baseTime: result.key.time,
        resume,
      })
    } finally {
      this.seeking = false
    }
  }

  syncClock() {
    if (!this.isPs || !this.h265?._demuxer_worker) return
    this.h265._demuxer_worker.postMessage({
      type: 'ps_clock',
      payload: {
        time: Math.max(0, this.currentTime - this.playbackBase),
        paused: !this.playing && !this.loadingFirstFrame,
      },
    })
  }

  startClock() {
    this.stopClock()
    this.clockTimer = window.setInterval(() => this.syncClock(), 250)
  }

  stopClock() {
    if (!this.clockTimer) return
    clearInterval(this.clockTimer)
    this.clockTimer = 0
  }

  startRemoteIndex(url) {
    this.stopRemoteIndex()
    const worker = new Worker(this.paths.remoteWorker)
    this.remoteWorker = worker
    worker.onmessage = (event) => {
      if (worker !== this.remoteWorker) return
      const message = event.data
      if (message.type === 'progress') return
      const pending = this.remotePending.get(message.id)
      if (!pending) return
      this.remotePending.delete(message.id)
      if (message.type === 'error') pending.reject(new Error(message.message))
      else pending.resolve(message.result)
    }
    worker.onerror = () => {
      if (worker === this.remoteWorker) this.stopRemoteIndex()
    }
    this.remoteRequest('init', { url })
      .then((result) => {
        if (worker !== this.remoteWorker) return
        this.remoteReady = true
        if (result?.duration > 0) {
          this.duration = result.duration
          this.onDuration?.(this.duration)
          this.emitTime()
        }
      })
      .catch((error) => {
        if (error?.name !== 'AbortError') console.warn('[hik-ps] 远程定位不可用', error)
      })
  }

  remoteRequest(type, payload = {}) {
    if (!this.remoteWorker) return Promise.reject(new Error('远程定位尚未就绪'))
    const id = ++this.remoteRequestId
    return new Promise((resolve, reject) => {
      this.remotePending.set(id, { resolve, reject })
      try {
        this.remoteWorker.postMessage({ type, id, ...payload })
      } catch (error) {
        this.remotePending.delete(id)
        reject(error)
      }
    })
  }

  stopRemoteIndex() {
    this.remoteWorker?.terminate()
    this.remoteWorker = null
    this.remoteReady = false
    for (const pending of this.remotePending.values()) {
      pending.reject(Object.assign(new Error('远程定位已取消'), { name: 'AbortError' }))
    }
    this.remotePending.clear()
  }

  async destroyPlayer({ keepRemote = false, bumpToken = true } = {}) {
    if (bumpToken) this.token += 1
    if (!keepRemote) {
      this.stopRemoteIndex()
      this.playbackBase = 0
    }
    this.playing = false
    this.loadingFirstFrame = false
    this.stopClock()
    const native = this.mediaEl
    this.mediaEl = null
    if (native) {
      native.pause()
      native.removeAttribute('src')
      native.load()
      native.remove()
    }
    const player = this.h265
    this.h265 = null
    if (player) {
      await new Promise((resolve) => {
        try {
          player.release?.(resolve)
        } catch {
          resolve()
        }
      })
    }
    if (this.surface) this.surface.innerHTML = ''
  }

  async destroy() {
    await this.destroyPlayer()
    if (this.container) this.container.innerHTML = ''
  }
}
