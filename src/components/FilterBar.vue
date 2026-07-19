<script setup>
const props = defineProps({
  samples:    Array,
  sample:     String,
  resultCount: Number,
});

const emit = defineEmits([
  "update:sample",
  "reset",
]);
</script>

<template>
  <div class="flex flex-col gap-4">

    <!-- Sample -->
    <div class="flex flex-col gap-1">
      <label class="text-[10px] uppercase tracking-widest text-gray-400 font-semibold">Sample</label>
      <select
        :value="sample"
        @change="emit('update:sample', $event.target.value)"
        class="w-full bg-white border border-gray-300 text-gray-700 text-sm rounded-md px-2 py-1.5 outline-none focus:border-teal-500 cursor-pointer"
      >
        <option value="all">All (cohort)</option>
        <option v-for="s in samples" :key="s" :value="s">{{ s }}</option>
      </select>
    </div>

    <!-- Reset + count -->
    <div class="flex items-center justify-between pt-1">
      <button
        @click="emit('reset')"
        class="px-3 py-1.5 text-sm border border-gray-300 text-gray-500 rounded-md hover:border-teal-400 hover:text-gray-700 transition-colors bg-white"
      >
        Reset
      </button>
      <span class="text-xs text-gray-400">{{ resultCount }} targets</span>
    </div>

  </div>
</template>
