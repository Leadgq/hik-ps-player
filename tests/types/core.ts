import {
  createHikPlayer, identifyContainer, inspectRemoteContainer, resolveAssetPaths,
  resolveWatermarkStyle, createH265Player, h265BuildOptions, getPsPlayerFactory,
  HikPsPlayerElement,
} from 'hik-ps-player'
import type {
  HikPlayer, HikPlayerOptions, HikTimeState, HikContainerInfo,
  HikWatermark, HikWatermarkOption,
} from 'hik-ps-player'

const watermark: HikWatermarkOption = { text: '测试', gap: 320, fontSize: 18, color: '#fff' }
const options: HikPlayerOptions = {
  container: document.createElement('div'), url: '/video.ps', watermark,
  onTime(state) {
    const time: HikTimeState = state
    const playing: boolean = time.playing
    // @ts-expect-error 时间值是数字。
    const invalid: string = state.currentTime
    void [playing, invalid]
  },
}
const player: HikPlayer = await createHikPlayer(options)
await player.seek(30)
const playback: void | Promise<void> = player.play()
player.setWatermark()
player.setWatermark('测试')
player.setWatermark(watermark)
await player.destroy()
const info: HikContainerInfo = identifyContainer(new Uint8Array(4096))
const remote: HikContainerInfo = await inspectRemoteContainer('/video.ps')
const paths: string = resolveAssetPaths().sdkDir
const image: string | undefined = resolveWatermarkStyle(watermark)?.backgroundImage
const absent: ReturnType<typeof resolveWatermarkStyle> = null
const sdk = await createH265Player(true)
sdk.build(h265BuildOptions('player'))
sdk.load_media('/video.ps')
const factory = await getPsPlayerFactory()
factory().pause()
const element = new HikPsPlayerElement()
element.src = '/video.ps'
element.watermark = watermark
const text: string = element.watermark
// @ts-expect-error 播放地址必填。
createHikPlayer({ container: document.createElement('div') })
// @ts-expect-error 跳转时间必须是数字。
player.seek('30')
// @ts-expect-error 水印间距必须是数字。
const invalidWatermark: HikWatermark = { gap: '320' }
// @ts-expect-error 输入必须是字节数组。
identifyContainer('video')
// @ts-expect-error SDK 类型标志必须是布尔值。
createH265Player('ps')
// @ts-expect-error src 必须是字符串。
element.src = 123
void [playback, info, remote, paths, image, absent, text, invalidWatermark]
