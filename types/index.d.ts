export interface HikContainerInfo {
  isPs: boolean
  description: string
}

export interface HikTimeState {
  currentTime: number
  duration: number
  playing: boolean
}

export interface HikWatermarkOption {
  text?: string
  gap?: number
  fontSize?: number
  color?: string
}

export type HikWatermark = string | HikWatermarkOption

export interface HikPlayerOptions {
  container: HTMLElement
  url: string
  assetBase?: string
  watermark?: HikWatermark
  onTime?: (state: HikTimeState) => void
  onDuration?: (value: number) => void
  onStatus?: (text: string) => void
  onReady?: () => void
}

export interface HikPlayer {
  currentTime: number
  duration: number
  playing: boolean
  isPs: boolean
  toggle(): void
  play(): void | Promise<void>
  pause(): void
  seek(seconds: number): Promise<void>
  setWatermark(watermark?: HikWatermark): void
  fitSurface(): void
  destroy(): Promise<void>
}

export function identifyContainer(bytes: Uint8Array): HikContainerInfo
export function inspectRemoteContainer(url: string): Promise<HikContainerInfo>
export function resolveAssetPaths(assetBase?: string): {
  root: string
  sdkDir: string
  remoteWorker: string
}
export function resolveWatermarkStyle(watermark?: HikWatermark): {
  backgroundImage: string
  backgroundRepeat: string
} | null
export function createHikPlayer(options: HikPlayerOptions): Promise<HikPlayer>
export class HikPsPlayerElement extends HTMLElement {
  src: string
  assetBase: string
  watermark: string
}
