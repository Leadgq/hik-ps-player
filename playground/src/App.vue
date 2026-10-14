<script setup>
import { ref } from 'vue'
import { HikPsVideo } from '../../dist/vue3.js'
import { HIK_TEST_URL } from './url.js'

const watermark = ref('水印测试')

function toggleWatermark() {
  watermark.value = watermark.value ? '' : '水印测试'
}
</script>

<template>
  <main class="page">
    <header class="page__head">
      <h1>hik-ps-player · dist/vue3</h1>
      <p>默认没有水印。当前：{{ watermark || '关闭' }}</p>
      <button type="button" class="page__toggle" @click="toggleWatermark">
        {{ watermark ? '关闭水印' : '打开水印' }}
      </button>
    </header>
    <div class="frame">
      <HikPsVideo :src="HIK_TEST_URL" :watermark="watermark" />
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
  margin: 0 0 12px;
  color: #8aa0b5;
  font-size: 13px;
}
.page__toggle {
  margin-bottom: 16px;
  border: 0;
  border-radius: 4px;
  padding: 6px 12px;
  background: #3ba9ff;
  color: #fff;
  cursor: pointer;
}
.frame {
  width: 100%;
  height: 520px;
}
</style>
