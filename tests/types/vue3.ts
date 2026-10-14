import { createApp } from 'vue'
import { HikPsVideo } from 'hik-ps-player/vue3'
import type { HikPsVideoProps } from 'hik-ps-player/vue3'

createApp({}).component('HikPsVideo', HikPsVideo)
type ComponentProps = InstanceType<typeof HikPsVideo>['$props']
const empty: ComponentProps = {}
const props: ComponentProps = { src: '/video.ps', watermark: { text: '测试', gap: 320 } }
const publicProps: HikPsVideoProps = props
// @ts-expect-error 实际组件的 src 必须是字符串。
const invalidSrc: ComponentProps = { src: 123 }
// @ts-expect-error 实际组件的水印间距必须是数字。
const invalidWatermark: ComponentProps = { watermark: { gap: '320' } }
void [empty, publicProps, invalidSrc, invalidWatermark]
