import { HikPsVideo } from 'hik-ps-player/react'
import type { HikPsVideoProps } from 'hik-ps-player/react'
import type { HikWatermark } from 'hik-ps-player'

const watermark: HikWatermark = { text: '测试', gap: 320 }
const props: HikPsVideoProps = { src: '/video.ps', watermark }
const empty = <HikPsVideo />
const video = <HikPsVideo {...props} />
const text = <HikPsVideo watermark="测试" />
// @ts-expect-error 水印支持对象，但字号必须是数字。
const invalid = <HikPsVideo watermark={{ fontSize: '18' }} />
// @ts-expect-error src 必须是字符串。
const invalidSrc = <HikPsVideo src={123} />
void [empty, video, text, invalid, invalidSrc]
