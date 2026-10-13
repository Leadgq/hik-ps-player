/* 远程跳转定位：只读头、尾、目标附近小块，不建全文件关键帧表。
 * 结果是「目标时间之前最近的关键帧」的 { time, offset }，给拆包 Worker 从该字节接着播。 */
'use strict';
importScripts('./ps-parser.js');
const SAMPLE_BYTES = 512 * 1024;
const INIT_BUDGET = 8 * 1024 * 1024;
const SEEK_BUDGET = 16 * 1024 * 1024;
const MAX_REQUESTS = 24;
const MAX_POINTS = 4096;

class RemotePsIndex {
  constructor(url) {
    this.url = url;
    this.total = 0;
    this.origin = null;   // 文件头第一帧 PTS，后面时间都相对它
    this.duration = 0;
    this.points = [];     // 稀疏时间点（首尾 + 探测到的边界）
    this.keys = [];       // 已见过的关键帧，数量有上限
    this.streamTypes = new Map();
    this.readBytes = 0;
    this.bufferBytes = 0;
  }

  stats(operation) {
    return {
      readBytes: this.readBytes, bufferBytes: this.bufferBytes, points: this.points.length + this.keys.length,
      operationBytes: operation.bytes, requests: operation.requests, total: this.total
    };
  }

  operation(budget) { return { budget, bytes: 0, requests: 0, started: performance.now() }; }

  /** 读一段并计入本次操作预算。超时 / 次数 / 字节超限就停，避免把整文件下下来。 */
  async range(start, length, operation) {
    start = Math.max(0, Math.floor(start));
    if (this.total) length = Math.min(length, this.total - start);
    if (length <= 0) throw new Error('远程定位超出文件范围');
    if (operation.bytes + length > operation.budget || operation.requests >= MAX_REQUESTS || performance.now() - operation.started > 30000) {
      throw new Error('本次远程定位已达到读取或时间上限，未进行全量下载；请换一个位置重试');
    }
    operation.requests++;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.min(10000, Math.max(1, 30000 - (performance.now() - operation.started))));
    let reader;
    try {
      const response = await fetch(this.url, { headers: { Range: `bytes=${start}-${start + length - 1}` }, signal: controller.signal });
      if (response.status !== 206) throw new Error(`远程定位要求 Range / 206，服务器返回 HTTP ${response.status}`);
      const match = /^bytes (\d+)-(\d+)\/(\d+)$/i.exec(response.headers.get('Content-Range') || '');
      if (!match) throw new Error('无法读取有效 Content-Range，请检查 MinIO CORS 响应头暴露配置');
      const first = Number(match[1]), last = Number(match[2]), total = Number(match[3]);
      if (![first, last, total].every(Number.isSafeInteger) || first !== start || last < first || last >= total || last - first + 1 > length) {
        throw new Error('远程定位的分段响应位置或长度不正确');
      }
      if (this.total && this.total !== total) throw new Error('远程录像大小发生变化，请重新加载');
      this.total = total;
      const bytes = new Uint8Array(last - first + 1);
      this.bufferBytes = bytes.byteLength;
      self.postMessage({ type: 'progress', stats: this.stats(operation) });
      reader = response.body?.getReader();
      if (!reader) throw new Error('远程定位响应没有文件内容');
      let count = 0;
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        this.readBytes += chunk.value.byteLength;
        operation.bytes += chunk.value.byteLength;
        if (count + chunk.value.byteLength > bytes.length) throw new Error('远程定位响应超过读取限额');
        bytes.set(chunk.value, count);
        count += chunk.value.byteLength;
      }
      if (count !== bytes.length) throw new Error('远程定位分段响应不完整');
      return { start, bytes };
    } catch (error) {
      if (error.name === 'AbortError') throw new Error('远程定位请求超时，请检查网络或重新获取视频链接');
      throw error;
    } finally {
      clearTimeout(timer);
      controller.abort();
      reader?.releaseLock();
      this.bufferBytes = 0;
    }
  }

  /** 合并定位点；超过上限只留均匀抽样，内存不跟着文件涨。 */
  remember(list, records) {
    const merged = new Map(list.map(record => [record.offset, record]));
    for (const record of records) merged.set(record.offset, record);
    const sorted = [...merged.values()].sort((a, b) => a.offset - b.offset);
    if (sorted.length <= MAX_POINTS) return sorted;
    return Array.from({ length: MAX_POINTS }, (_, i) => sorted[Math.round(i * (sorted.length - 1) / (MAX_POINTS - 1))]);
  }

  /** 读一块，用 indexOnly 解析出帧时间/偏移。半截包（不是从 Pack 头开始）丢掉。 */
  async sample(start, length, operation) {
    const block = await this.range(start, length, operation);
    const raw = [];
    const parser = new PsTools.PsParser({
      indexOnly: true, video: frame => {
        const local = frame.offset - block.start;
        if (local >= 0 && block.bytes[local] === 0 && block.bytes[local + 1] === 0 && block.bytes[local + 2] === 1 && block.bytes[local + 3] === 0xba) raw.push(frame);
      }
    }, block.start);
    parser.streamTypes = new Map(this.streamTypes);
    try {
      parser.feed(block.bytes);
      parser.finish();
      this.streamTypes = new Map(parser.streamTypes);
    } finally {
      parser.clear();
    }
    if (this.origin === null && raw.length) this.origin = raw[0].pts;
    const records = raw.map(frame => ({ time: PsTools.deltaSeconds(frame.pts, this.origin), offset: frame.offset, pts: frame.pts, isKey: frame.isKey }))
      .filter(frame => Number.isFinite(frame.time) && frame.time >= 0);
    if (records.length) {
      this.points = this.remember(this.points, [records[0], records[records.length - 1]]);
      this.keys = this.remember(this.keys, records.filter(frame => frame.isKey));
    }
    self.postMessage({ type: 'progress', stats: this.stats(operation) });
    return records;
  }

  /** 先读头拿时间原点，再读尾估算总时长。 */
  async init() {
    const operation = this.operation(INIT_BUDGET);
    let head = [];
    for (let size = SAMPLE_BYTES; size <= 2 * 1024 * 1024 && !head.length; size *= 2) head = await this.sample(0, size, operation);
    if (!head.length) throw new Error('录像文件头未找到有效视频时间戳，无法建立远程定位');
    let tail = [];
    for (let size = SAMPLE_BYTES; size <= 4 * 1024 * 1024 && !tail.length; size *= 2) {
      tail = await this.sample(Math.max(0, this.total - size), Math.min(size, this.total), operation);
    }
    if (!tail.length) throw new Error('录像末尾未找到有效视频时间戳，无法估算时长');
    const times = tail.map(frame => frame.time);
    let frameDuration = 0;
    for (let i = 1; i < times.length; i++) if (times[i] > times[i - 1]) frameDuration = times[i] - times[i - 1];
    this.duration = Math.max(...times) + frameDuration;
    if (!(this.duration > 0)) throw new Error('录像时间戳不连续，无法进行远程定位');
    return { duration: this.duration, stats: this.stats(operation) };
  }

  clampSeekTarget(target) {
    return Math.max(0, Math.min(this.duration - 0.1, Number(target) || 0));
  }

  /** 缓存里已经有几乎同一时刻的关键帧，直接用。 */
  findExactKey(target) {
    return this.keys.find(key => Math.abs(key.time - target) < 0.001) || null;
  }

  /** 用已缓存点夹住目标：low ≤ target < high。 */
  bracketTarget(target) {
    let low = this.points[0], high = this.points[this.points.length - 1];
    for (const point of this.points) {
      if (point.time <= target && point.offset >= low.offset) low = point;
      if (point.time > target && point.offset <= high.offset) high = point;
    }
    if (low.time > target || high.time < target || low.offset > high.offset) {
      throw new Error('录像时间戳范围异常，无法定位目标');
    }
    return { low, high };
  }

  /** 按时间比例猜探测起点，只用于选位置，最终以真实 PTS 为准。 */
  guessProbeStart(low, high, target) {
    const gap = high.offset - low.offset;
    const ratio = high.time > low.time
      ? Math.max(0.1, Math.min(0.9, (target - low.time) / (high.time - low.time)))
      : 0.5;
    return Math.floor(low.offset + Math.max(1, Math.min(gap - SAMPLE_BYTES, gap * ratio - SAMPLE_BYTES / 2)));
  }

  /** 用这一块探测结果收窄 [low, high]。夹住目标就停。 */
  tightenBracket(low, high, target, records) {
    const before = records.filter(frame => frame.time <= target);
    const after = records.filter(frame => frame.time > target);
    if (before.length && after.length) {
      return { low: before[before.length - 1], high: after[0], done: true };
    }
    if (before.length) {
      const next = before[before.length - 1];
      if (next.offset <= low.offset || next.time < low.time) {
        throw new Error('录像时间戳不连续，无法继续定位');
      }
      return { low: next, high, done: false };
    }
    const next = after[0];
    if (next.offset >= high.offset || next.time > high.time) {
      throw new Error('录像时间戳不连续，无法继续定位');
    }
    return { low, high: next, done: false };
  }

  /** 最多 16 轮探测，把区间收到 512KiB 以内。 */
  async convergeBracket(low, high, target, operation) {
    for (let attempt = 0; attempt < 16 && high.offset - low.offset > SAMPLE_BYTES; attempt++) {
      const records = await this.sample(this.guessProbeStart(low, high, target), SAMPLE_BYTES, operation);
      if (!records.length) throw new Error('探测片段没有有效视频时间戳，请换一个位置重试');
      const next = this.tightenBracket(low, high, target, records);
      low = next.low;
      high = next.high;
      if (next.done) break;
    }
    if (high.offset - low.offset > SAMPLE_BYTES) {
      throw new Error('远程定位尚未收敛，未进行全量下载；请重试');
    }
    return { low, high };
  }

  /** 从 low 附近扩大窗口，找目标之前最近的关键帧，并确认后面还有一帧。 */
  async findKeyframeBefore(low, target, operation) {
    for (let size = SAMPLE_BYTES; size <= 8 * 1024 * 1024; size *= 2) {
      const start = Math.max(0, low.offset - Math.floor(size / 2));
      const records = await this.sample(start, size, operation);
      const keys = records.filter(frame => frame.isKey);
      const before = keys.filter(frame => frame.time <= target).sort((a, b) => a.time - b.time);
      if (before.length && (keys.some(frame => frame.time > target) || start + size >= this.total)) {
        return before[before.length - 1];
      }
    }
    throw new Error('目标附近未找到可跳转的关键帧，未进行全量下载');
  }

  /**
   * 定位 target 秒之前最近的关键帧。
   * 1) 用已缓存点夹住目标
   * 2) 按时间插值选探测位置，再用真实 PTS 收敛
   * 3) 扩大窗口确认关键帧后面还有一帧，避免漏掉更近的 IDR
   */
  async seek(target) {
    const operation = this.operation(SEEK_BUDGET);
    target = this.clampSeekTarget(target);
    const exact = this.findExactKey(target);
    if (exact) return { key: exact, stats: this.stats(operation) };
    const { low, high } = this.bracketTarget(target);
    const bracket = await this.convergeBracket(low, high, target, operation);
    const key = await this.findKeyframeBefore(bracket.low, target, operation);
    return { key, stats: this.stats(operation) };
  }
}

let index = null, busy = false;
self.onmessage = async event => {
  const message = event.data;
  if (busy) { self.postMessage({ type: 'error', id: message.id, message: '远程定位正在处理，请稍后重试' }); return; }
  busy = true;
  try {
    if (message.type === 'init') {
      index = new RemotePsIndex(message.url);
      self.postMessage({ type: 'ready', id: message.id, result: await index.init() });
    } else if (message.type === 'seek') {
      if (!index?.duration) throw new Error('远程定位尚未就绪');
      self.postMessage({ type: 'seek', id: message.id, result: await index.seek(message.time) });
    }
  } catch (error) {
    self.postMessage({ type: 'error', id: message.id, message: error.message });
  } finally { busy = false; }
};
