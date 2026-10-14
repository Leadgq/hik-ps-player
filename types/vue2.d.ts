export interface HikPsVideoProps {
  src?: string
  assetBase?: string
}

export const HikPsVideo: {
  name: 'HikPsVideo'
  props: {
    src: { type: StringConstructor; default: string }
    assetBase: { type: StringConstructor; default: string }
  }
}
