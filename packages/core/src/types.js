/**
 * @typedef {object} HikContainerInfo
 * @property {boolean} isPs
 * @property {string} description
 *
 * @typedef {object} HikTimeState
 * @property {number} currentTime
 * @property {number} duration
 * @property {boolean} playing
 *
 * @typedef {object} HikWatermarkOption
 * @property {string} [text]
 * @property {number} [gap]
 * @property {number} [fontSize]
 * @property {string} [color]
 *
 * @typedef {string | HikWatermarkOption} HikWatermark
 *
 * @typedef {object} HikPlayerOptions
 * @property {HTMLElement} container
 * @property {string} url
 * @property {string} [assetBase]
 * @property {HikWatermark} [watermark]
 * @property {(state: HikTimeState) => void} [onTime]
 * @property {(value: number) => void} [onDuration]
 * @property {(text: string) => void} [onStatus]
 * @property {() => void} [onReady]
 */

/**
 * 播放器对外支持的接口，不包含内部 SDK、Worker 和生命周期方法。
 * @typedef {object} HikPlayer
 * @property {number} currentTime
 * @property {number} duration
 * @property {boolean} playing
 * @property {boolean} isPs
 * @property {() => void} toggle
 * @property {() => void | Promise<void>} play
 * @property {() => void} pause
 * @property {(seconds: number) => Promise<void>} seek
 * @property {(watermark?: HikWatermark) => void} setWatermark
 * @property {() => void} fitSurface
 * @property {() => Promise<void>} destroy
 */

/**
 * @typedef {object} HikPsVideoProps
 * @property {string} [src]
 * @property {string} [assetBase]
 * @property {HikWatermark} [watermark]
 */

export {}
