function watermarkText(watermark) {
  if (typeof watermark === 'string') return watermark.trim()
  return String(watermark?.text || '').trim()
}

function escapeXml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * 平铺文字水印。不传或空字符串则没有水印。
 * watermark 可以是字符串，或 { text, gap, fontSize, color }。
 * @param {import('./types.js').HikWatermark} [watermark]
 * @returns {{ backgroundImage: string, backgroundRepeat: string } | null}
 */
export function resolveWatermarkStyle(watermark) {
  const text = watermarkText(watermark)
  if (!text) return null
  const option = typeof watermark === 'object' && watermark ? watermark : {}
  const gap = Number(option.gap) > 0 ? Number(option.gap) : 420
  const fontSize = Number(option.fontSize) > 0 ? Number(option.fontSize) : 20
  const color = option.color || 'rgba(255,255,255,0.35)'
  const safe = escapeXml(text)
  const textWidth = fontSize * text.length * 0.65 + 40
  const tileW = Math.max(gap, textWidth)
  const tileH = gap
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${tileW}" height="${tileH}"><text x="50%" y="50%" text-anchor="middle" dominant-baseline="middle" font-size="${fontSize}" font-weight="bold" fill="${color}" transform="rotate(-30 ${tileW / 2} ${tileH / 2})">${safe}</text></svg>`
  return {
    backgroundImage: `url("data:image/svg+xml,${encodeURIComponent(svg)}")`,
    backgroundRepeat: 'repeat',
  }
}
