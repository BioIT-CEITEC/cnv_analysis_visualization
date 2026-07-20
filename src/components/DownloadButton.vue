<!--
  Small icon button placed next to ChartInfo in each panel header.
  Purely presentational — the parent decides what "download" means (chart image, xlsx, ...).
-->
<script setup>
defineProps({
  title: { type: String, default: 'Download' },
})
defineEmits(['click'])
</script>

<template>
  <button
    @click="$emit('click')"
    :title="title"
    class="w-5 h-5 rounded-full flex items-center justify-center text-gray-400 hover:text-[#21a8c2] hover:bg-[#21a8c20a] transition-colors"
  >
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4">
      <path d="M12 3v13m0 0l-4.5-4.5M12 16l4.5-4.5"/>
      <path d="M4.5 18v1.5A1.5 1.5 0 006 21h12a1.5 1.5 0 001.5-1.5V18"/>
    </svg>
  </button>
</template>
