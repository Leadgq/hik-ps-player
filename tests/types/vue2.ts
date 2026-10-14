import Vue from 'vue'
import { HikPsVideo } from 'hik-ps-player/vue2'
import type { HikPsVideoProps } from 'hik-ps-player/vue2'

Vue.component('HikPsVideo', HikPsVideo)
const Video = Vue.extend(HikPsVideo)
const instance = new Video()
instance.src = '/video.ps'
instance.assetBase = '/h265web/'
instance.watermark = { text: '测试', gap: 320 }
instance.watermark = '测试'
const props: HikPsVideoProps = { src: '/video.ps', watermark: { fontSize: 18 } }
// @ts-expect-error 实际组件推断的 src 必须是字符串。
instance.src = 123
// @ts-expect-error 实际组件推断的水印间距必须是数字。
instance.watermark = { gap: '320' }
// @ts-expect-error 导出的 Props 与组件共用水印类型。
const invalidProps: HikPsVideoProps = { watermark: { fontSize: '18' } }
void [props, invalidProps]
