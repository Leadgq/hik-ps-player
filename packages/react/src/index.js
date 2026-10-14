import { createElement as h, useEffect, useRef, useState } from 'react'
import { createHikPlayer } from '@hik-ps/core/player'

const STYLE = `
.hik-ps-react { display: flex; flex-direction: column; position: relative; width: 100%; height: 100%; min-height: 0; background: #000; color: #fff; }
.hik-ps-react__stage { position: relative; flex: 1; width: 100%; min-height: 0; overflow: hidden; background: #000; }
.hik-ps-react__stage canvas, .hik-ps-react__stage video {
  position: absolute !important; inset: 0 !important; width: 100% !important; height: 100% !important;
  margin: 0 !important; object-fit: contain;
}
.hik-ps-react__status {
  position: absolute; left: 0; right: 0; top: 40%; transform: translateY(-50%); margin: 0;
  text-align: center; pointer-events: none;
}
.hik-ps-react__timeline {
  flex-shrink: 0; height: 8px; margin: 12px 12px 0; background: #d9e6f2;
  border-radius: 4px; cursor: pointer;
}
.hik-ps-react__played { height: 100%; background: #3ba9ff; }
.hik-ps-react__bar { flex-shrink: 0; display: flex; align-items: center; justify-content: flex-end; gap: 12px; padding: 8px 12px 12px; }
.hik-ps-react__time { font-size: 13px; }
.hik-ps-react__icon {
  display: flex; align-items: center; justify-content: center; width: 28px; height: 28px;
  padding: 0; border: 0; border-radius: 4px; color: #fff; background: transparent; cursor: pointer;
}
.hik-ps-react__icon svg { width: 22px; height: 22px; }
.hik-ps-react:fullscreen { width: 100%; height: 100%; background: #000; }
`

function icon(path) {
  return h('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true' }, h('path', { fill: 'currentColor', d: path }))
}

function formatTime(sec) {
  const value = Math.max(0, Number(sec) || 0)
  const hours = Math.floor(value / 3600)
  const minutes = Math.floor((value % 3600) / 60)
  const seconds = Math.floor(value % 60)
  return [hours, minutes, seconds].map((n) => String(n).padStart(2, '0')).join(':')
}

/**
 * @typedef {import('@hik-ps/core').HikPsVideoProps} HikPsVideoProps
 * @param {HikPsVideoProps} props
 * @returns {import('react').ReactElement}
 */
export function HikPsVideo({ src = '', assetBase = '/h265web/', watermark = '' }) {
  const box = useRef(null)
  const playerRef = useRef(null)
  const tokenRef = useRef(0)
  const root = useRef(null)
  const [status, setStatus] = useState('')
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [playing, setPlaying] = useState(false)

  useEffect(() => {
    const token = ++tokenRef.current
    let cancelled = false
    ;(async () => {
      await playerRef.current?.destroy()
      if (cancelled || token !== tokenRef.current) return
      playerRef.current = null
      setCurrentTime(0)
      setDuration(0)
      if (!src || !box.current) return
      try {
        const next = await createHikPlayer({
          container: box.current,
          url: src,
          assetBase,
          watermark,
          onStatus: (text) => {
            if (token === tokenRef.current) setStatus(text)
          },
          onTime: (state) => {
            if (token !== tokenRef.current) return
            setCurrentTime(state.currentTime)
            setPlaying(state.playing)
          },
          onDuration: (value) => {
            if (token === tokenRef.current) setDuration(value)
          },
        })
        if (cancelled || token !== tokenRef.current) {
          await next.destroy()
          return
        }
        playerRef.current = next
      } catch (error) {
        if (token === tokenRef.current) setStatus(error?.message || '视频加载失败')
      }
    })()
    return () => {
      cancelled = true
      tokenRef.current += 1
      playerRef.current?.destroy()
      playerRef.current = null
    }
  }, [src, assetBase])

  useEffect(() => {
    playerRef.current?.setWatermark(watermark)
  }, [watermark])

  useEffect(() => {
    let timer = 0
    const fit = () => {
      if (timer) clearTimeout(timer)
      requestAnimationFrame(() => playerRef.current?.fitSurface())
      timer = window.setTimeout(() => playerRef.current?.fitSurface(), 80)
    }
    const sync = () => {
      setIsFullscreen(document.fullscreenElement === root.current)
      fit()
    }
    document.addEventListener('fullscreenchange', sync)
    window.addEventListener('resize', fit)
    return () => {
      document.removeEventListener('fullscreenchange', sync)
      window.removeEventListener('resize', fit)
      if (timer) clearTimeout(timer)
    }
  }, [])

  async function toggleFullscreen() {
    if (!root.current) return
    if (document.fullscreenElement === root.current) {
      await document.exitFullscreen()
      return
    }
    await root.current.requestFullscreen()
  }

  function onSeek(event) {
    const player = playerRef.current
    if (!player || !(duration > 0)) return
    const rect = event.currentTarget.getBoundingClientRect()
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width))
    player.seek(ratio * duration).catch((error) => {
      setStatus(error?.message || '跳转失败')
    })
  }

  const played = duration ? `${Math.min(100, (currentTime / duration) * 100)}%` : '0%'

  function onToggle(event) {
    event.stopPropagation()
    playerRef.current?.toggle()
    setPlaying(Boolean(playerRef.current?.playing))
  }

  return h(
    'div',
    { ref: root, className: 'hik-ps-react' },
    h('style', null, STYLE),
    h('div', { ref: box, className: 'hik-ps-react__stage' }),
    status ? h('p', { className: 'hik-ps-react__status' }, status) : null,
    h(
      'div',
      {
        className: 'hik-ps-react__timeline',
        onClick: (event) => {
          event.stopPropagation()
          onSeek(event)
        },
      },
      h('div', { className: 'hik-ps-react__played', style: { width: played } }),
    ),
    h(
      'div',
      { className: 'hik-ps-react__bar' },
      h(
        'button',
        { type: 'button', className: 'hik-ps-react__icon', title: playing ? '暂停' : '播放', onClick: onToggle },
        playing ? icon('M6 19h4V5H6v14zm8-14v14h4V5h-4z') : icon('M8 5v14l11-7z'),
      ),
      h(
        'button',
        {
          type: 'button',
          className: 'hik-ps-react__icon',
          title: isFullscreen ? '退出全屏' : '全屏',
          onClick: (event) => {
            event.stopPropagation()
            toggleFullscreen()
          },
        },
        isFullscreen
          ? icon('M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z')
          : icon('M7 14H5v5h5v-2H7v-3zm12 0h-2v3h-3v2h5v-5zM7 7h3V5H5v5h2V7zm7-2v2h3v3h2V5h-5z'),
      ),
      h(
        'div',
        { className: 'hik-ps-react__time' },
        `${formatTime(currentTime)} / ${duration ? formatTime(duration) : '--:--:--'}`,
      ),
    ),
  )
}
