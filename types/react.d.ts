import type { ReactElement } from 'react'

export interface HikPsVideoProps {
  src?: string
  assetBase?: string
  watermark?: string | { text?: string; gap?: number; fontSize?: number; color?: string }
}

export function HikPsVideo(props: HikPsVideoProps): ReactElement
