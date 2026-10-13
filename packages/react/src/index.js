import { createElement as h, useEffect, useRef, useState } from 'react'
import { createHikPlayer } from '../core/player.js'

const STYLE = `
.hik-ps-react { position: relative; width: 100%; background: #000; color: #fff; }
.hik-ps-react__stage { width: 100%; height: 450px; }
.hik-ps-react__status {
  position: absolute; left: 0; right: 0; top: 180px; margin: 0;
  text-align: center; pointer-events: none;
}
.hik-ps-react__timeline {
  height: 8px; margin: 12px 12px 0; background: #d9e6f2;
  border-radius: 4px; cursor: pointer;
}
.hik-ps-react__played { height: 100%; background: #3ba9ff; }
.hik-ps-react__bar { display: flex; align-items: center; justify-content: flex-end; gap: 12px; padding: 8px 12px 12px; }
.hik-ps-react__time { font-size: 13px; }
.hik-ps-react__fullscreen { border: 0; border-radius: 4px; padding: 4px 10px; background: #3ba9ff; color: #fff; font-size: 13px; cursor: pointer; }
.hik-ps-react:fullscreen { display: flex; flex-direction: column; width: 100%; height: 100%; background: #000; }
.hik-ps-react:fullscreen .hik-ps-react__stage { flex: 1; height: auto; min-height: 0; }
`

function formatTime(sec) {
  const value = Math.max(0, Number(sec) || 0)
  const hours = Math.floor(value / 3600)
  const minutes = Math.floor((value % 3600) / 60)
  const seconds = Math.floor(value % 60)
  return [hours, minutes, seconds].map((n) => String(n).padStart(2, '0')).join(':')
}

export function HikPsVideo({ src = '', assetBase = '/h265web/' }) {
  const box = useRef(null)
  const playerRef = useRef(null)
  const tokenRef = useRef(0)
  const root = useRef(null)
  const [status, setStatus] = useState('')
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [isFullscreen, setIsFullscreen] = useState(false)

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
          onStatus: (text) => {
            if (token === tokenRef.current) setStatus(text)
          },
          onTime: (state) => {
            if (token === tokenRef.current) setCurrentTime(state.currentTime)
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
    const sync = () => setIsFullscreen(document.fullscreenElement === root.current)
    document.addEventListener('fullscreenchange', sync)
    return () => document.removeEventListener('fullscreenchange', sync)
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

  return h(
    'div',
    { ref: root, className: 'hik-ps-react', onClick: () => playerRef.current?.toggle() },
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
        'div',
        { className: 'hik-ps-react__time' },
        `${formatTime(currentTime)} / ${duration ? formatTime(duration) : '--:--:--'}`,
      ),
      h(
        'button',
        {
          type: 'button',
          className: 'hik-ps-react__fullscreen',
          onClick: (event) => {
            event.stopPropagation()
            toggleFullscreen()
          },
        },
        isFullscreen ? '退出全屏' : '全屏',
      ),
    ),
  )
}
