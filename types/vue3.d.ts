import type { DefineComponent } from 'vue'

export interface HikPsVideoProps {
  src?: string
  assetBase?: string
  watermark?: string | { text?: string; gap?: number; fontSize?: number; color?: string }
}

export const HikPsVideo: DefineComponent<HikPsVideoProps>
