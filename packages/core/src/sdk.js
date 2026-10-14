import { resolveAssetPaths } from './paths.js'

const cache = new Map()

/**
 * SDK 实例的基础播放接口；SDK 内部字段不作为库的公共接口。
 * @typedef {object} H265Player
 * @property {(options: ReturnType<typeof h265BuildOptions> & { format_type?: string }) => void} build
 * @property {(url: string) => void} load_media
 * @property {() => void} play
 * @property {() => void} pause
 * @property {(done?: () => void) => void} release
 */

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const existed = document.querySelector(`script[src="${src}"]`)
    if (existed) {
      if (existed.dataset.loaded === '1') {
        resolve()
        return
      }
      existed.addEventListener('load', () => resolve(), { once: true })
      existed.addEventListener('error', () => reject(new Error(`脚本加载失败：${src}`)), { once: true })
      return
    }
    const script = document.createElement('script')
    script.src = src
    script.onload = () => {
      script.dataset.loaded = '1'
      resolve()
    }
    script.onerror = () => {
      script.remove()
      reject(new Error(`脚本加载失败：${src}`))
    }
    document.head.appendChild(script)
  })
}

function bucket(assetBase) {
  const paths = resolveAssetPaths(assetBase)
  let state = cache.get(paths.sdkDir)
  if (!state) {
    state = { paths }
    cache.set(paths.sdkDir, state)
  }
  return state
}

/** @param {string} [assetBase] @returns {Promise<() => H265Player>} */
export async function getDefaultPlayerFactory(assetBase) {
  const state = bucket(assetBase)
  if (state.defaultFactory) return state.defaultFactory
  if (!state.defaultFactoryPromise) {
    state.defaultFactoryPromise = loadScript(`${state.paths.sdkDir}h265web.js`).then(() => {
      state.defaultFactory = window.H265webjsPlayer
      if (typeof state.defaultFactory !== 'function') {
        throw new Error('找不到 H265webjsPlayer，请确认 h265web/output 已发布到站点')
      }
      return state.defaultFactory
    })
  }
  return state.defaultFactoryPromise.catch((error) => {
    state.defaultFactoryPromise = null
    throw error
  })
}

/** @param {string} [assetBase] @returns {Promise<() => H265Player>} */
export async function getPsPlayerFactory(assetBase) {
  const state = bucket(assetBase)
  if (state.psFactory) return state.psFactory
  const official = await getDefaultPlayerFactory(assetBase)
  if (!state.psFactoryPromise) {
    state.psFactoryPromise = loadScript(`${state.paths.sdkDir}h265web-ps.js`).then(() => {
      const factory = window.H265webjsPlayer
      window.H265webjsPlayer = official
      if (typeof factory !== 'function' || factory === official) {
        throw new Error('PS 播放入口无效')
      }
      state.psFactory = factory
      return state.psFactory
    })
  }
  return state.psFactoryPromise.catch((error) => {
    state.psFactoryPromise = null
    throw error
  })
}

/** @param {boolean} isPs @param {string} [assetBase] @returns {Promise<H265Player>} */
export function createH265Player(isPs, assetBase) {
  return (isPs ? getPsPlayerFactory(assetBase) : getDefaultPlayerFactory(assetBase)).then((factory) => factory())
}

/** @param {string} playerId @param {string} [assetBase] */
export function h265BuildOptions(playerId, assetBase) {
  const { sdkDir } = resolveAssetPaths(assetBase)
  return {
    player_id: playerId,
    base_url: sdkDir,
    wasm_js_uri: 'h265web_wasm.js',
    wasm_wasm_uri: 'h265web_wasm.wasm',
    ext_src_js_uri: 'extjs.js',
    ext_wasm_js_uri: 'extwasm.js',
    width: '100%',
    height: '100%',
    color: '#000000',
    auto_play: false,
    ignore_audio: false,
  }
}
