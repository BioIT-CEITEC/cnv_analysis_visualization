<!--
  Data Table — sortable, paginated table of all filtered CNV calls.
  Click any column header to sort. 6 rows per page.
-->
<script setup>
import { ref, computed, watch } from "vue";
import { CHROM_ORDER } from "../../composables/useFilters.js";

const props = defineProps({ data: Array });
const emit = defineEmits(['navigate']);

const sortKey = ref("CHROM");
const sortDir = ref(1);
const page = ref(0);
const PAGE = 6;
const selectedRows = ref([]);

function sort(key) {
  if (sortKey.value === key) sortDir.value *= -1;
  else {
    sortKey.value = key;
    sortDir.value = 1;
  }
  page.value = 0;
}

const sorted = computed(() =>
  [...props.data].sort((a, b) => {
    const av = a[sortKey.value], bv = b[sortKey.value];
    if (sortKey.value === "CHROM")
      return (CHROM_ORDER.indexOf(String(av)) - CHROM_ORDER.indexOf(String(bv))) * sortDir.value;
    if (typeof av === "number") return (av - bv) * sortDir.value;
    return String(av ?? "").localeCompare(String(bv ?? "")) * sortDir.value;
  }),
);

const pages = computed(() => Math.max(1, Math.ceil(sorted.value.length / PAGE)));
const pageRows = computed(() => sorted.value.slice(page.value * PAGE, (page.value + 1) * PAGE));

function rowToTarget(r) {
  return { gene: r.gene, chrom: r.CHROM, start: r.START, end: r.END, sample: r.sample, type: r.consensus_type };
}

watch(
  () => props.data,
  () => {
    page.value = 0;
    const first = sorted.value[0];
    if (first) {
      selectedRows.value = [first];
      emit('navigate', [rowToTarget(first)]);
    } else {
      selectedRows.value = [];
      emit('navigate', []);
    }
  },
  { immediate: true },
);

const classColor = cls => {
  if (!cls) return ''
  if (cls.toLowerCase().includes('pathogenic')) return 'text-red-600 bg-red-50'
  if (cls.toLowerCase().includes('benign'))     return 'text-green-600 bg-green-50'
  return 'text-gray-500 bg-gray-50'
}

const cols = [
  { key: "sample",         label: "Sample" },
  { key: "CHROM",          label: "Chr" },
  { key: "START",          label: "Start" },
  { key: "END",            label: "End" },
  { key: "gene",           label: "Gene" },
  { key: "consensus_type", label: "Type" },
  { key: "n_callers",      label: "Callers" },
  { key: "Classification", label: "Classification", noSort: true },
];

function toggleRow(row) {
  const idx = selectedRows.value.indexOf(row);
  if (idx >= 0) {
    selectedRows.value = selectedRows.value.filter((_, i) => i !== idx);
  } else {
    selectedRows.value = [...selectedRows.value, row];
  }
  emit('navigate', selectedRows.value.map(rowToTarget));
}
</script>

<template>
  <div class="overflow-x-auto">
    <table class="w-full text-xs border-collapse">
      <thead>
        <tr class="border-b border-gray-200 bg-gray-50">
          <th class="px-3 py-2 w-8 text-center text-[10px] uppercase tracking-wider font-semibold text-gray-400">
            <svg class="w-3.5 h-3.5 inline text-gray-300" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25"/></svg>
          </th>
          <th
            v-for="col in cols"
            :key="col.key"
            @click="!col.noSort && sort(col.key)"
            :class="[
              'px-3 py-2 text-left text-[10px] uppercase tracking-wider font-semibold text-gray-400 whitespace-nowrap',
              !col.noSort ? 'cursor-pointer hover:text-gray-600 select-none' : '',
            ]"
          >
            {{ col.label }}
            <span v-if="sortKey === col.key" class="text-teal-500 ml-0.5">
              {{ sortDir === 1 ? "↑" : "↓" }}
            </span>
          </th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="(row, i) in pageRows"
          :key="i"
          :class="[
            'border-b border-gray-100 transition-colors cursor-pointer',
            selectedRows.includes(row) ? 'bg-teal-50 hover:bg-teal-50' : 'hover:bg-gray-50',
          ]"
          @click="toggleRow(row)"
        >
          <td class="px-3 py-2 text-center">
            <span :class="[
              'inline-flex items-center justify-center w-4 h-4 rounded border transition-colors',
              selectedRows.includes(row)
                ? 'bg-teal-500 border-teal-500 text-white'
                : 'border-gray-300 bg-white',
            ]">
              <svg v-if="selectedRows.includes(row)" class="w-2.5 h-2.5" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5"/></svg>
            </span>
          </td>
          <td class="px-3 py-2 text-gray-500 font-mono text-[11px]">{{ row.sample }}</td>
          <td class="px-3 py-2 text-gray-500">chr{{ row.CHROM }}</td>
          <td class="px-3 py-2 text-gray-500 font-mono">{{ row.START.toLocaleString() }}</td>
          <td class="px-3 py-2 text-gray-500 font-mono">{{ row.END.toLocaleString() }}</td>
          <td class="px-3 py-2 text-teal-600 font-medium">{{ row.gene || '—' }}</td>
          <td class="px-3 py-2">
            <span :class="[
              'px-1.5 py-0.5 rounded text-[11px] font-semibold',
              row.consensus_type === 'DEL' ? 'bg-red-50 text-red-500'
              : row.consensus_type === 'DUP' ? 'bg-blue-50 text-blue-500' : '',
            ]">{{ row.consensus_type }}</span>
          </td>
          <td class="px-3 py-2 text-center text-gray-600 font-semibold">{{ row.n_callers }}</td>
          <td class="px-3 py-2">
            <span v-if="row.Classification" :class="['px-1.5 py-0.5 rounded text-[10px] font-medium', classColor(row.Classification)]">
              {{ row.Classification }}
            </span>
            <span v-else class="text-gray-300">—</span>
          </td>
        </tr>
      </tbody>
    </table>

    <!-- Pagination -->
    <div class="flex items-center justify-center gap-4 py-4 text-gray-400 text-xs">
      <button
        :disabled="page === 0"
        @click="page--"
        class="px-3 py-1.5 bg-white border border-gray-200 rounded-md hover:border-teal-400 hover:text-gray-700 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
      >← Prev</button>
      <span>Page {{ page + 1 }} of {{ pages }}</span>
      <button
        :disabled="page >= pages - 1"
        @click="page++"
        class="px-3 py-1.5 bg-white border border-gray-200 rounded-md hover:border-teal-400 hover:text-gray-700 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
      >Next →</button>
    </div>
  </div>
</template>
