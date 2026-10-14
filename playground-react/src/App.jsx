import { HikPsVideo } from '@hik-ps/react'
import { HIK_TEST_URL } from '../../playground/src/url.js'

export default function App() {
  return (
    <main className="page">
      <header className="page__head">
        <h1>hik-ps-player · React</h1>
        <p>MinIO 预签名 · 许昌市鄢陵县生物质高效利用项目安装工程</p>
      </header>
      <div className="frame">
        <HikPsVideo src={HIK_TEST_URL} watermark="水印测试" />
      </div>
    </main>
  )
}
