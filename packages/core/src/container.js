export function identifyContainer(bytes) {
  if (bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) {
    return { isPs: false, description: '标准 MP4 / MOV' }
  }
  const hikvision = bytes[0] === 0x49 && bytes[1] === 0x4d && bytes[2] === 0x4b && bytes[3] === 0x48
  for (let offset = 0; offset + 5 <= bytes.length; offset++) {
    if (
      bytes[offset] === 0 &&
      bytes[offset + 1] === 0 &&
      bytes[offset + 2] === 1 &&
      bytes[offset + 3] === 0xba &&
      (bytes[offset + 4] & 0xc0) === 0x40
    ) {
      return { isPs: true, description: hikvision ? '海康 IMKH + MPEG-PS' : 'MPEG-PS' }
    }
  }
  return { isPs: false, description: '按扩展名识别' }
}

export async function inspectRemoteContainer(url) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 15000)
  let reader = null
  try {
    const response = await fetch(url, {
      headers: { Range: 'bytes=0-4095' },
      signal: controller.signal,
    })
    if (!response.ok) {
      throw new Error(
        response.status === 403
          ? '视频服务器返回 HTTP 403：请检查预签名链接是否过期'
          : `视频服务器返回 HTTP ${response.status}`,
      )
    }
    if (!response.body) throw new Error('视频服务器没有返回文件内容')
    reader = response.body.getReader()
    const bytes = new Uint8Array(4096)
    let length = 0
    while (length < bytes.length) {
      const chunk = await reader.read()
      if (chunk.done) break
      const count = Math.min(chunk.value.byteLength, bytes.length - length)
      bytes.set(chunk.value.subarray(0, count), length)
      length += count
    }
    if (!length) throw new Error('视频文件内容为空')
    const container = identifyContainer(bytes.subarray(0, length))
    try {
      container.isPs ||= /\.(ps|mpeg|mpg)$/i.test(new URL(url).pathname)
    } catch {
      /* ignore invalid url pathname */
    }
    if (container.isPs) {
      if (response.status !== 206) {
        throw new Error('海康 PS 播放要求视频服务器支持 Range 并返回 HTTP 206')
      }
      const contentRange = response.headers.get('Content-Range')
      if (!contentRange) {
        throw new Error('无法读取 Content-Range：请在 MinIO CORS 中暴露该响应头')
      }
      if (!/^bytes 0-\d+\/\d+$/i.test(contentRange)) {
        throw new Error('视频文件头的 Content-Range 不正确')
      }
    }
    return container
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('读取远程视频文件头超时')
    if (error instanceof TypeError) {
      throw new Error('无法读取远程视频：请检查网络、HTTPS 及 MinIO CORS（需允许当前页面来源和 Range）')
    }
    throw error
  } finally {
    clearTimeout(timer)
    controller.abort()
    reader?.releaseLock()
  }
}
