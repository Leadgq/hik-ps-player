/* MPEG-PS 拆包：把字节流切成 Pack / PES，再拼成一帧 HEVC / 一段 G.711A。
 * 只保留「还没拼完的当前包」和「正在组装的当前视频帧」，不缓存整段录像。 */
'use strict';
(() => {
  // MPEG 系统时钟 90 kHz；PTS 是 33 bit，约 26.5 小时绕回一次。
  const PTS_WRAP = 2 ** 33;
  const MAX_FRAME_BYTES = 4 * 1024 * 1024;
  const MAX_PACKET_BYTES = 256 * 1024;

  /** 从 PES 头读 5 字节 PTS/DTS。三个 marker bit 必须为 1，否则当坏包。 */
  function pts90k(b, p) {
    if (p + 5 > b.length || !(b[p] & 1) || !(b[p + 2] & 1) || !(b[p + 4] & 1)) return null;
    return ((b[p] >> 1) & 7) * 2 ** 30 + b[p + 1] * 2 ** 22 + (b[p + 2] >> 1) * 2 ** 15 + b[p + 3] * 128 + (b[p + 4] >> 1);
  }

  /** 相对片头的秒数；处理 33 bit PTS 绕回。 */
  function deltaSeconds(pts, origin) {
    let value = pts - origin;
    if (value < -PTS_WRAP / 2) value += PTS_WRAP;
    if (value > PTS_WRAP / 2) value -= PTS_WRAP;
    return value / 90000;
  }

  /** 找下一个 start code：00 00 01 xx，且 xx >= 0xB9（系统层，不是裸 NAL）。 */
  function findPs(b, from) {
    for (let p = from; p + 4 <= b.length; p++) {
      if (b[p] === 0 && b[p + 1] === 0 && b[p + 2] === 1 && b[p + 3] >= 0xb9) return p;
    }
    return -1;
  }

  /** 在一帧压缩数据里扫 NAL，判断是不是关键帧。
   *  H.264：NAL type 5 = IDR；H.265：type 16–21 = IRAP。 */
  function isKey(data, codec) {
    for (let p = 0; p + 5 < data.length; p++) {
      if (data[p] || data[p + 1] || data[p + 2] !== 1) continue;
      const type = codec === 264 ? data[p + 3] & 31 : (data[p + 3] >> 1) & 63;
      if (codec === 264 ? type === 5 : type >= 16 && type <= 21) return true;
    }
    return false;
  }

  class PsParser {
    constructor(callbacks = {}, offset = 0) {
      this.callbacks = callbacks;
      this.buffer = new Uint8Array();
      this.offset = offset;       // 当前 buffer[0] 对应文件里的绝对字节
      this.packOffset = offset;   // 最近一个 Pack 头（00 00 01 BA）的文件偏移，当作这一帧的定位点
      this.streamTypes = new Map(); // PES stream id → ISO stream_type（0x1B=AVC, 0x24=HEVC, 0x90=G.711A）
      this.frame = null;          // 正在拼的视频帧：同一 PTS 的多个 PES 合成一帧
    }

    get retainedBytes() { return this.buffer.byteLength + (this.callbacks.indexOnly ? 0 : (this.frame?.bytes || 0)); }

    /** 把当前帧交给回调。indexOnly 只报时间/偏移/是否关键帧，不拼完整 NAL。 */
    flushFrame() {
      const frame = this.frame;
      this.frame = null;
      if (!frame || !frame.bytes) return;
      if (this.callbacks.indexOnly) {
        this.callbacks.video?.({ pts: frame.pts, dts: frame.dts, offset: frame.offset, isKey: frame.key, bytes: frame.bytes });
        return;
      }
      const data = new Uint8Array(frame.bytes);
      let p = 0;
      for (const part of frame.parts) { data.set(part, p); p += part.byteLength; }
      this.callbacks.video?.({ pts: frame.pts, dts: frame.dts, offset: frame.offset, isKey: isKey(data, frame.codec), data });
    }

    /** 解析 Program Stream Map（stream_id=0xBC），记下每路 PES 的编码类型。 */
    streamMap(b, start, end) {
      if (start + 12 > end) return;
      let p = start + 10 + (b[start + 8] * 256 + b[start + 9]);
      if (p + 2 > end) return;
      const mapEnd = Math.min(end - 4, p + 2 + b[p] * 256 + b[p + 1]);
      p += 2;
      while (p + 4 <= mapEnd) {
        this.streamTypes.set(b[p + 1], b[p]);
        p += 4 + b[p + 2] * 256 + b[p + 3];
      }
    }

    /** 处理一个完整 PES：视频按 PTS 切帧，音频整包回调。 */
    packet(b, start, end) {
      const id = b[start + 3];
      if (id === 0xbc) { this.streamMap(b, start, end); return; }
      // 0xE0–0xEF 视频，0xC0–0xDF 音频；其它系统包直接丢。
      if (!((id >= 0xe0 && id <= 0xef) || (id >= 0xc0 && id <= 0xdf))) return;
      if (start + 9 > end || (b[start + 6] & 0xc0) !== 0x80) throw new Error('暂不支持 MPEG-1 PES 头');
      const body = start + 9 + b[start + 8];
      if (body > end) throw new Error('PS 包头长度无效');
      const flags = b[start + 7];
      const pts = flags & 0x80 ? pts90k(b, start + 9) : null;
      const dts = (flags & 0xc0) === 0xc0 ? pts90k(b, start + 14) : pts;
      const streamType = this.streamTypes.get(id);
      if (id >= 0xe0) {
        const codec = streamType === 0x1b ? 264 : 265;
        // PTS 变了 = 上一帧结束。
        if (pts !== null && this.frame && this.frame.pts !== pts) this.flushFrame();
        if (!this.frame && pts !== null) {
          this.frame = { pts, dts: dts ?? pts, offset: this.packOffset, parts: [], bytes: 0, codec, key: false };
          this.callbacks.videoTimestamp?.(pts);
        }
        if (!this.frame || body === end) return;
        this.frame.bytes += end - body;
        if (this.frame.bytes > MAX_FRAME_BYTES) throw new Error('单个压缩帧超过 4 MiB，已停止读取以保护内存');
        const payload = b.subarray(body, end);
        if (this.callbacks.indexOnly) this.frame.key ||= isKey(payload, codec);
        else this.frame.parts.push(payload.slice());
      } else if (pts !== null && body < end) {
        this.callbacks.audio?.({ pts, streamType, data: b.slice(body, end) });
      }
    }

    /** 喂一段字节。半包留在 buffer 里等下一块。 */
    feed(chunk) {
      const b = new Uint8Array(this.buffer.byteLength + chunk.byteLength);
      b.set(this.buffer); b.set(chunk, this.buffer.byteLength);
      this.buffer = new Uint8Array();
      let p = 0;
      while (p + 4 <= b.length) {
        const start = findPs(b, p);
        if (start < 0) { p = Math.max(p, b.length - 3); break; }
        const id = b[start + 3];
        let length;
        if (id === 0xba) {
          // Pack header：MPEG-2 固定 14 字节 + stuffing。
          if (start + 14 > b.length) { p = start; break; }
          if ((b[start + 4] & 0xc0) !== 0x40) throw new Error('暂不支持 MPEG-1 PS 包头');
          length = 14 + (b[start + 13] & 7);
        } else if (id === 0xb9) length = 4; // program end
        else {
          if (start + 6 > b.length) { p = start; break; }
          const size = b[start + 4] * 256 + b[start + 5];
          if (size) length = 6 + size;
          else {
            // 长度为 0 时用下一个 start code 当边界（海康偶发）。
            const next = findPs(b, start + 6);
            if (next < 0) { p = start; break; }
            length = next - start;
          }
        }
        if (start + length > b.length) { p = start; break; }
        if (id === 0xba) this.packOffset = this.offset + start;
        else this.packet(b, start, start + length);
        p = start + length;
      }
      this.buffer = b.slice(p);
      this.offset += p;
      if (this.buffer.byteLength > MAX_PACKET_BYTES) throw new Error('PS 待解析包超过 256 KiB，已停止读取');
    }

    finish() { this.flushFrame(); this.buffer = new Uint8Array(); }
    clear() { this.frame = null; this.buffer = new Uint8Array(); }
  }

  /** 只扫完整的 PSM（0xBC），不拼帧。跳转后的解析器拿不到文件头时用来预置流类型。 */
  function collectStreamTypes(bytes) {
    const parser = new PsParser();
    const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    for (let p = 0; p + 6 <= b.length; p++) {
      if (b[p] !== 0 || b[p + 1] !== 0 || b[p + 2] !== 1 || b[p + 3] !== 0xbc) continue;
      const size = b[p + 4] * 256 + b[p + 5];
      if (!size || p + 6 + size > b.length) continue;
      parser.streamMap(b, p, p + 6 + size);
    }
    return parser.streamTypes;
  }

  globalThis.PsTools = { PsParser, pts90k, deltaSeconds, collectStreamTypes, MAX_FRAME_BYTES, MAX_PACKET_BYTES };
})();
