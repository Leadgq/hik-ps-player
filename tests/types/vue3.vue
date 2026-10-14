<script setup lang="ts">
import { HikPsVideo } from 'hik-ps-player/vue3'
</script>

<template>
  <HikPsVideo />
  <HikPsVideo src="/video.ps" :watermark="{ text: '测试', gap: 320 }" />
  <!-- @vue-expect-error src 必须是字符串。 -->
  <HikPsVideo :src="123" />
  <!-- @vue-expect-error 水印间距必须是数字。 -->
  <HikPsVideo :watermark="{ gap: '320' }" />
</template>
