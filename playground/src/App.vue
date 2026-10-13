<script setup>
import { HikPsVideo } from '@hik-ps/vue3'
import { HIK_TEST_URL } from './url.js'
</script>

<template>
  <main class="page">
    <header class="page__head">
      <h1>hik-ps-player</h1>
      <p>MinIO 预签名 · 许昌市鄢陵县生物质高效利用项目安装工程</p>
    </header>
    <div class="frame">
      <HikPsVideo :src="HIK_TEST_URL" />
    </div>
  </main>
</template>

<style>
html,
body {
  margin: 0;
  background: #0b1016;
  color: #d7e3ef;
  font-family: 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif;
}
.page {
  max-width: 960px;
  margin: 0 auto;
  padding: 24px 16px 48px;
}
.page__head h1 {
  margin: 0 0 8px;
  font-size: 20px;
  font-weight: 600;
}
.page__head p {
  margin: 0 0 16px;
  color: #8aa0b5;
  font-size: 13px;
}
.frame {
  width: 100%;
  height: 520px;
}
</style>
