<script setup>
import { ref, computed, nextTick } from 'vue'

const props = defineProps({
  samples:    Array,
  sample:     String,
  chromosomes: Array,
  chrom:      String,
  type:       String,
  caller:     String,
  callerList: { type: Array, default: () => [] },
  resultCount: Number,
  geneList:           { type: Array, default: () => [] },
  gene:               { type: String, default: '' },
  classificationList: { type: Array, default: () => [] },
  classification:     { type: String, default: 'all' },
});

const emit = defineEmits([
  "update:sample",
  "update:chrom",
  "update:type",
  "update:caller",
  "update:gene",
  "update:classification",
  "reset",
]);

const geneSearch       = ref('')
const geneDropdownOpen = ref(false)
const geneInputRef     = ref(null)

const filteredGeneList = computed(() => {
  if (!geneSearch.value) return props.geneList
  const q = geneSearch.value.toLowerCase()
  return props.geneList.filter(g => g.toLowerCase().includes(q))
})

function onGeneInputFocus() {
  geneSearch.value = props.gene || ''
  geneDropdownOpen.value = true
}

function onGeneInput() {
  geneDropdownOpen.value = true
}

function onGeneBlur() {
  geneDropdownOpen.value = false
  geneSearch.value = props.gene || ''
}

function selectGene(g) {
  emit('update:gene', g)
  geneDropdownOpen.value = false
  geneSearch.value = g
}

function clearGene() {
  emit('update:gene', '')
  geneSearch.value = ''
  geneDropdownOpen.value = true
  nextTick(() => geneInputRef.value?.focus())
}
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
        <option v-for="s in samples" :key="s" :value="s">{{ s }}</option>
      </select>
    </div>

    <!-- Chromosome -->
    <div class="flex flex-col gap-1">
      <label class="text-[10px] uppercase tracking-widest text-gray-400 font-semibold">Chromosome</label>
      <select
        :value="chrom"
        @change="emit('update:chrom', $event.target.value)"
        class="w-full bg-white border border-gray-300 text-gray-700 text-sm rounded-md px-2 py-1.5 outline-none focus:border-teal-500 cursor-pointer"
      >
        <option value="all">All</option>
        <option v-for="c in chromosomes" :key="c" :value="c">chr{{ c }}</option>
      </select>
    </div>

    <!-- CNV Type -->
    <div class="flex flex-col gap-1">
      <label class="text-[10px] uppercase tracking-widest text-gray-400 font-semibold">CNV Type</label>
      <div class="flex w-full">
        <button
          v-for="t in ['all', 'DEL', 'DUP']"
          :key="t"
          @click="emit('update:type', t)"
          :class="[
            'flex-1 py-1.5 text-sm font-medium border transition-colors first:rounded-l-md last:rounded-r-md border-l-0 first:border-l',
            type === t
              ? t === 'DEL' ? 'bg-red-50 border-red-400 text-red-600'
              : t === 'DUP' ? 'bg-blue-50 border-blue-400 text-blue-600'
              : 'bg-teal-50 border-teal-400 text-teal-600'
              : 'bg-white border-gray-300 text-gray-500 hover:bg-gray-50',
          ]"
        >{{ t === 'all' ? 'All' : t }}</button>
      </div>
    </div>

    <!-- Caller -->
    <div class="flex flex-col gap-1">
      <label class="text-[10px] uppercase tracking-widest text-gray-400 font-semibold">Caller</label>
      <select
        :value="caller"
        @change="emit('update:caller', $event.target.value)"
        class="w-full bg-white border border-gray-300 text-gray-700 text-sm rounded-md px-2 py-1.5 outline-none focus:border-teal-500 cursor-pointer"
      >
        <option value="all">All callers</option>
        <option v-for="c in callerList" :key="c" :value="c">{{ c }}</option>
      </select>
    </div>

    <!-- Gene selector (searchable combobox) -->
    <div class="flex flex-col gap-1">
      <label class="text-[10px] uppercase tracking-widest text-gray-400 font-semibold">Gene</label>
      <div v-if="geneList.length" class="relative">
        <div class="flex items-center w-full bg-white border border-gray-300 rounded-md px-2 py-1.5 focus-within:border-teal-500 transition-colors">
          <input
            ref="geneInputRef"
            type="text"
            v-model="geneSearch"
            @focus="onGeneInputFocus"
            @input="onGeneInput"
            @blur="onGeneBlur"
            placeholder="Search gene…"
            class="flex-1 text-sm outline-none bg-transparent min-w-0 text-gray-700"
          />
          <button
            v-if="gene"
            @mousedown.prevent
            @click="clearGene"
            class="ml-1 text-gray-300 hover:text-gray-500 text-xs flex-shrink-0 leading-none"
          >✕</button>
        </div>
        <div
          v-if="geneDropdownOpen"
          class="absolute z-50 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-48 overflow-y-auto"
        >
          <div
            @mousedown.prevent
            @click="selectGene('')"
            :class="['px-3 py-1.5 text-sm cursor-pointer text-gray-400 hover:bg-gray-50', gene === '' ? 'bg-gray-50' : '']"
          >All genes</div>
          <div
            v-for="g in filteredGeneList"
            :key="g"
            @mousedown.prevent
            @click="selectGene(g)"
            :class="['px-3 py-1.5 text-sm cursor-pointer hover:bg-teal-50 hover:text-teal-700', g === gene ? 'bg-teal-50 text-teal-700 font-medium' : 'text-gray-700']"
          >{{ g }}</div>
          <div v-if="!filteredGeneList.length" class="px-3 py-1.5 text-sm text-gray-300">No results</div>
        </div>
      </div>
      <input
        v-else
        type="text"
        placeholder="Search gene…"
        :value="gene"
        @input="emit('update:gene', $event.target.value)"
        class="w-full bg-white border border-gray-300 text-gray-700 text-sm rounded-md px-2 py-1.5 outline-none focus:border-teal-500 placeholder:text-gray-300"
      />
    </div>

    <!-- Classification -->
    <div v-if="classificationList.length" class="flex flex-col gap-1">
      <label class="text-[10px] uppercase tracking-widest text-gray-400 font-semibold">Classification</label>
      <select
        :value="classification"
        @change="emit('update:classification', $event.target.value)"
        class="w-full bg-white border border-gray-300 text-gray-700 text-sm rounded-md px-2 py-1.5 outline-none focus:border-teal-500 cursor-pointer"
      >
        <option value="all">All</option>
        <option v-for="c in classificationList" :key="c" :value="c">{{ c }}</option>
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
