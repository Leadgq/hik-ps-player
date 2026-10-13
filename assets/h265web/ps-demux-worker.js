/* 播放用拆包 Worker：按 Range 分段拉 PS，拆成 HEVC NAL + G.711A PCM 送给 h265web。
 * 不把整段录像读进 JS / WASM。时钟由主线程 ps_clock 驱动，只预读约 2 秒。 */
'use strict';
importScripts('./ps-parser.js');
// 分段读取大小为 128KiB
const CHUNK_BYTES = 128 * 1024;
// 缓存大小为 4MiB
const CACHE_BYTES = 4 * 1024 * 1024;
// 预读 2 秒
const READ_AHEAD_SECONDS = 2;
// 配置
let config = null, source = null, cursor = 0, total = 0, origin = null;
let parser = null, info = null, video = [], audio = [], bytes = 0;
let wantVideo = 0, wantAudio = 0, clock = 0, paused = false;
let busy = false, eof = false, ended = false, released = false, request = null;
let parsedUntil = 0, lastVideo = 0, lastAudio = 0, readBytes = 0, probeHeap = 0;

function post(type, payload, transfer = []) {
  if (!released)
    self.postMessage({ type, payload }, transfer);
}

function stats() {
  post('ps_stats', {
    bufferBytes: bytes + (parser?.retainedBytes || 0), parserBytes: parser?.retainedBytes || 0,
    budgetBytes: CACHE_BYTES + PsTools.MAX_FRAME_BYTES + PsTools.MAX_PACKET_BYTES + CHUNK_BYTES, readBytes, cursor, total,
    aheadSeconds: Math.max(0, parsedUntil - clock), paused, probeHeapBytes: probeHeap,
    videoPackets: video.length, audioPackets: audio.length
  });
}

/** HTTP Range 读一段。必须 206 + Content-Range，否则会把整文件拉下来。 */
async function range(start, length) {
  request = new AbortController();
  const response = await fetch(source, { headers: { Range: `bytes=${start}-${start + length - 1}` }, signal: request.signal });
  if (response.status !== 206) throw new Error('PS 按需播放要求服务器支持 Range / 206');
  const contentRange = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(response.headers.get('Content-Range') || '');
  if (!contentRange || Number(contentRange[1]) !== start) throw new Error('PS 文件分段响应位置不正确');
  total = Number(contentRange[3]);
  const data = new Uint8Array(await response.arrayBuffer());
  if (data.byteLength > length) throw new Error('PS 分段响应超过读取限额');
  request = null;
  return data;
}

/** 只用文件头一小块让 WASM 报出宽高/编码；探测完立刻释放，正式播放走 JS 拆包。 */
async function probe(data) {
  importScripts(config.wasm_js_uri);
  let module = await WasmModule({ noInitialRun: true, locateFile: () => config.wasm_wasm_uri, print: () => { } });
  module._main();
  probeHeap = module.HEAPU8.byteLength;
  const functions = [];
  let context = null, result = null;
  const fn = (callback, signature) => { const pointer = module.addFunction(callback, signature); functions.push(pointer); return pointer; };
  try {
    context = module.ccall('init_demuxer_ctx', 'number', [], []);
    const onProbe = fn((needSwr, duration, w, h, fps, audioIndex, sampleRate, channel, codec, audioCodecId, audioName, delivery, format, mediaType, extraSize, extraPointer) => {
      result = {
        needSwr, duration: 0, demuxer_media_type: 'vod', w, h, fps, audioIndex, sampleRate, channel, codec,
        videoCodecId: codec, audioCodecId, audioCodecName: audioName ? module.UTF8ToString(audioName) : 'none',
        audioDelivery: audioCodecId > 0 && !config.ignore_audio ? 'pcm_f32' : 'disabled', hasAudio: audioCodecId > 0,
        fmt: format ? module.UTF8ToString(format) : '', media_fmt: 'mpegps', extra_data: new ArrayBuffer(0), extra_size: 0
      };
    }, 'vidiidiiiiiiiiiii');
    module.ccall('bind_demuxer_callback', 'number', Array(10).fill('number'), [context,
      fn(() => { }, 'v'), onProbe, fn(() => { }, 'vii'), fn(() => { }, 'viiiiiiiidi'),
      fn(() => { }, 'viiiiidd'), fn(() => { }, 'viid'), fn(() => { }, 'viiid'), config.ignore_audio ? 1 : 0, 30]);
    module.ccall('ffdemuxer_set_mode_live', 'number', ['number'], [context]);
    const ptr = module._malloc(data.byteLength);
    try {
      module.HEAPU8.set(data, ptr);
      module.ccall('push_buffer', 'number', Array(4).fill('number'), [context, ptr, data.byteLength, 4096]);
      if (!result) {
        module.ccall('fetch_done_buffer', 'number', ['number'], [context]);
        module.ccall('push_probe', 'number', ['number', 'number'], [context, 4096]);
      }
    } finally { module._free(ptr); }
    if (!result?.w || !result?.h || result.codec !== 265) throw new Error('PS 按需入口目前支持 HEVC 录像，未探测到有效 HEVC 视频');
    if (result.hasAudio && !config.ignore_audio && (result.audioCodecName !== 'pcm_alaw' || result.sampleRate !== 8000 || result.channel !== 1)) {
      throw new Error(`PS 按需入口要求 8 kHz 单声道 G.711A 音频；探测结果 ${result.audioCodecName} / ${result.sampleRate} Hz / ${result.channel} 声道`);
    }
    return result;
  } finally {
    if (context !== null) module.ccall('release_demuxer_ctx', 'number', ['number'], [context]);
    for (const pointer of functions) module.removeFunction(pointer);
    module = null; probeHeap = 0;
  }
}

/** G.711 A-law → Float32 PCM，给 SDK 音频回调。 */
function alaw(data) {
  const pcm = new Float32Array(data.length);
  for (let i = 0; i < data.length; i++) {
    const value = data[i] ^ 0x55, segment = (value & 0x70) >> 4;
    let sample = (value & 15) << 4;
    sample = segment === 0 ? sample + 8 : segment === 1 ? sample + 264 : (sample + 264) << (segment - 1);
    pcm[i] = (value & 0x80 ? sample : -sample) / 32768;
  }
  return new Uint8Array(pcm.buffer);
}

/** 把已解析且时间到了的帧交给解码器。暂停或超前太多就不送。 */
function drain() {
  while (wantVideo > 0 && video.length && video[0].pts <= clock + 1.2 && !paused) {
    const frame = video.shift(); 
    bytes -= frame.nalu.byteLength; 
    wantVideo--;
    post('demuxer_nalu_cb', frame, [frame.nalu.buffer]);
  }
  while (wantAudio > 0 && audio.length && audio[0].pts <= clock + 0.8 && !paused) {
    const packet = audio.shift(); 
    bytes -= packet.data.byteLength; 
    wantAudio--;
    const nalu = alaw(packet.data);
    post('demuxer_aac_cb', { nalu, len: nalu.byteLength, pts: packet.pts, ch: 1, delivery: 'pcm_f32' }, [nalu.buffer]);
  }
  if (eof && !video.length && !audio.length && !ended) {
    ended = true;
    post('demuxer_vod_nalu_done', { v_last_dts: lastVideo * 1000, a_last_dts: lastAudio * 1000 });
    post('fetch-done', { is_vod: true, is_complete: true });
  }
}

/** 需要更多数据时再拉下一块 128KiB，解析后继续 drain。 */
async function pump() {
  if (busy || released || !info || paused) return;
  busy = true;
  try {
    while (!paused && !released) {
      drain();
      if (eof || (!wantVideo && !wantAudio) || bytes >= CACHE_BYTES || parsedUntil > clock + READ_AHEAD_SECONDS) break;
      const chunk = await range(cursor, Math.min(CHUNK_BYTES, total - cursor));
      if (released) break;
      cursor += chunk.byteLength; readBytes += chunk.byteLength;
      parser.feed(chunk);
      if (cursor >= total) { parser.finish(); eof = true; }
    }
    drain();
  } catch (error) {
    if (error.name !== 'AbortError') { paused = true; post('ps_error', { message: error.message }); }
  } finally { busy = false; stats(); }
}

/** 打开录像。startOffset 是跳转后的字节位置，由 Worker 消息传入，不要写进预签名 URL。 */
async function load(url, startOffset) {
  source = url;
  const options = new URL(url);
  cursor = Number(startOffset ?? options.searchParams.get('__ps_start') ?? 0);
  if (!Number.isSafeInteger(cursor) || cursor < 0) throw new Error('PS 跳转位置无效');
  // 跳转后的小块可能没有 PSM。文件头已经读过，先把流映射留下来再丢掉字节。
  let metadata = await range(0, 1024 * 1024);
  readBytes += metadata.byteLength;
  const headerTypes = PsTools.collectStreamTypes(metadata);
  info = await probe(metadata);
  metadata = null;
  if (released) return;
  const initial = await range(cursor, CHUNK_BYTES);
  parser = new PsTools.PsParser({
    videoTimestamp: pts => { if (origin === null) origin = pts; },
    video: frame => {
      const pts = PsTools.deltaSeconds(frame.pts, origin), dts = PsTools.deltaSeconds(frame.dts, origin);
      if (pts < 0) return;
      bytes += frame.data.byteLength; parsedUntil = Math.max(parsedUntil, pts); lastVideo = Math.max(lastVideo, dts);
      video.push({ nalu: frame.data, pts, dts, isKey: frame.isKey ? 1 : 0, w: info.w, h: info.h });
    },
    audio: packet => {
      if (!info.hasAudio || config.ignore_audio || origin === null) return;
      if (packet.streamType !== 0x90) throw new Error('PS 音频流类型不是 G.711A');
      const pts = PsTools.deltaSeconds(packet.pts, origin);
      if (pts < 0) return;
      bytes += packet.data.byteLength; lastAudio = Math.max(lastAudio, pts);
      audio.push({ data: packet.data, pts });
    }
  }, cursor);
  parser.streamTypes = headerTypes;
  post('demuxer_probe_cb', info);
  cursor += initial.byteLength; readBytes += initial.byteLength;
  parser.feed(initial);
  if (cursor >= total) { parser.finish(); eof = true; }
  pump();
}

self.onmessage = event => {
  const message = event.data;
  if (message.type === 'init') { config = message.payload; post('ready', {}); }
  else if (message.type === 'loadMedia') {
    load(message.payload.media_uri,
      message.payload.ps_start_offset)
      .catch(error => post('ps_error', { message: error.message }));
  }
  else if (message.type === 'demux') {
    // SDK 要帧：记下缺口，再泵数据。
    wantVideo = Math.max(wantVideo, Math.min(12, message.payload.recv_v_count || 1));
    wantAudio = Math.max(wantAudio, Math.min(16, message.payload.recv_a_count || 1));
    pump();
  } else if (message.type === 'ps_clock') {
    // 主线程 250ms 一次。time 是相对当前片段起点（跳转后从 0 再计）。
    clock = Math.max(0, Number(message.payload.time) || 0);
    paused = message.payload.paused;
    if (paused) {
      request?.abort();
    } else {
      pump();
    }
  } else if (message.type === 'release') {
    released = true;
    request?.abort();
    parser?.clear();
    video = [];
    audio = [];
    bytes = 0;
    self.postMessage({ type: 'release_done', payload: {} });
  }
};
setInterval(stats, 500);
