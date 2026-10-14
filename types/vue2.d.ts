export interface HikPsVideoProps {
  src?: string
  assetBase?: string
  watermark?: string | { text?: string; gap?: number; fontSize?: number; color?: string }
}

export const HikPsVideo: {
  name: 'HikPsVideo'
  props: {
    src: { type: StringConstructor; default: string }
    assetBase: { type: StringConstructor; default: string }
  }
}
