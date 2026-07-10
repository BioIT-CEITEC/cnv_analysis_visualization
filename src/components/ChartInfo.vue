<script setup>
import { ref, onMounted, onUnmounted } from 'vue'

const props = defineProps({
  file:        { type: [String, Array], default: null },
  columns:     { type: Array,  default: () => [] },
  description: { type: String, default: '' },
})

const open   = ref(false)
const root   = ref(null)

function toggle(e) {
  e.stopPropagation()
  open.value = !open.value
}

function onOutside(e) {
  if (root.value && !root.value.contains(e.target)) open.value = false
}

onMounted(()  => document.addEventListener('click', onOutside))
onUnmounted(() => document.removeEventListener('click', onOutside))
</script>

<template>
  <div ref="root" class="relative inline-block">
    <!-- Icon button -->
    <button
      @click="toggle"
      class="w-5 h-5 rounded-full flex items-center justify-center text-gray-400 hover:text-[#21a8c2] hover:bg-[#21a8c20a] transition-colors"
      title="About this chart"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4">
        <circle cx="12" cy="12" r="10"/>
        <line x1="12" y1="11" x2="12" y2="17"/>
        <line x1="12" y1="7" x2="12.01" y2="7"/>
      </svg>
    </button>

    <!-- Popup -->
    <Transition
      enter-active-class="transition-all duration-150 ease-out"
      enter-from-class="opacity-0 scale-95"
      enter-to-class="opacity-100 scale-100"
      leave-active-class="transition-all duration-100 ease-in"
      leave-from-class="opacity-100 scale-100"
      leave-to-class="opacity-0 scale-95"
    >
      <div
        v-if="open"
        class="absolute right-0 top-7 z-50 w-72 bg-white border border-gray-200 rounded-xl shadow-lg p-4 text-left"
      >
        <!-- Source file(s) -->
        <div v-if="file" class="mb-3">
          <p class="text-[9px] uppercase tracking-widest text-gray-400 font-semibold mb-1">Source file</p>
          <template v-if="Array.isArray(file)">
            <code
              v-for="f in file" :key="f"
              class="block text-xs bg-gray-50 text-[#101828] border border-gray-200 rounded px-2 py-0.5 mb-1 font-mono"
            >{{ f }}</code>
          </template>
          <code v-else class="block text-xs bg-gray-50 text-[#101828] border border-gray-200 rounded px-2 py-0.5 font-mono">{{ file }}</code>
        </div>

        <!-- Columns used -->
        <div v-if="columns.length" class="mb-3">
          <p class="text-[9px] uppercase tracking-widest text-gray-400 font-semibold mb-1">Columns used</p>
          <div class="flex flex-wrap gap-1">
            <span
              v-for="col in columns" :key="col"
              class="text-[10px] bg-[#21a8c20a] text-[#21a8c2] border border-[#21a8c2]/20 rounded px-1.5 py-0.5 font-mono"
            >{{ col }}</span>
          </div>
        </div>

        <!-- Description -->
        <div v-if="description">
          <p class="text-[9px] uppercase tracking-widest text-gray-400 font-semibold mb-1">How it works</p>
          <p class="text-xs text-gray-600 leading-relaxed">{{ description }}</p>
        </div>
      </div>
    </Transition>
  </div>
</template>
