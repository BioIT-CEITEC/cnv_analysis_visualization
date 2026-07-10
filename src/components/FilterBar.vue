<script setup>
defineProps({
  samples: Array,
  sample: String,
  chromosomes: Array,
  chrom: String,
  type: String,
  concordance: Number,
  caller: String,
  resultCount: Number,
  geneList: { type: Array, default: () => [] },
  gene: { type: String, default: '' },
});

const CALLERS = [
  { value: "cnvkit",      label: "CNVkit" },
  { value: "exomedepth",  label: "ExomeDepth" },
  { value: "cnmops",      label: "cnMOPS" },
  { value: "panelcnmops", label: "PanelCNMOPS" },
  { value: "freec",       label: "FreeC" },
  { value: "xhmm",        label: "XHMM" },
  { value: "conifer",     label: "CoNIFER" },
  { value: "jabcontool",  label: "JabConTool" },
  { value: "gatk_gcnv",   label: "GATK gCNV" },
];

const emit = defineEmits([
  "update:sample",
  "update:chrom",
  "update:type",
  "update:concordance",
  "update:caller",
  "update:gene",
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
        <option value="all">All</option>
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

    <!-- Min Callers -->
    <div class="flex flex-col gap-1">
      <label class="text-[10px] uppercase tracking-widest text-gray-400 font-semibold">Min. Callers</label>
      <div class="flex w-full">
        <button
          v-for="n in [1, 2, 3, 4, 5]"
          :key="n"
          @click="emit('update:concordance', n)"
          :class="[
            'flex-1 py-1.5 text-sm font-medium border transition-colors first:rounded-l-md last:rounded-r-md border-l-0 first:border-l',
            concordance === n
              ? 'bg-teal-50 border-teal-400 text-teal-600'
              : 'bg-white border-gray-300 text-gray-500 hover:bg-gray-50',
          ]"
        >{{ n }}</button>
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
        <option v-for="c in CALLERS" :key="c.value" :value="c.value">{{ c.label }}</option>
      </select>
    </div>

    <!-- Gene selector -->
    <div class="flex flex-col gap-1">
      <label class="text-[10px] uppercase tracking-widest text-gray-400 font-semibold">Gene</label>
      <select
        v-if="geneList.length"
        :value="gene"
        @change="emit('update:gene', $event.target.value)"
        class="w-full bg-white border border-gray-300 text-gray-700 text-sm rounded-md px-2 py-1.5 outline-none focus:border-teal-500 cursor-pointer"
      >
        <option value="">All genes</option>
        <option v-for="g in geneList" :key="g" :value="g">{{ g }}</option>
      </select>
      <input
        v-else
        type="text"
        placeholder="Search gene..."
        :value="gene"
        @input="emit('update:gene', $event.target.value)"
        class="w-full bg-white border border-gray-300 text-gray-700 text-sm rounded-md px-2 py-1.5 outline-none focus:border-teal-500 placeholder:text-gray-300"
      />
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
