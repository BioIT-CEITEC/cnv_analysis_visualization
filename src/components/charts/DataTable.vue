<!--
  Data Table — sortable, paginated table of all filtered CNV calls.
  Click any column header to sort. Rows per page is configurable via the pageSize prop.
-->
<script setup>
import { ref, computed, watch } from "vue";
import { CHROM_ORDER } from "../../composables/useFilters.js";
import { formatCallers } from "../../utils/callers.js";

const props = defineProps({
  data: Array,
  pageSize: { type: Number, default: 6 },
  // Sample column is only useful when rows span multiple samples (cohort view)
  showSample: { type: Boolean, default: true },
});
const emit = defineEmits(['navigate']);

const sortKey = ref("CHROM");
const sortDir = ref(1);
const page = ref(0);
const selectedRows = ref([]);

function sort(key) {
  if (sortKey.value === key) sortDir.value *= -1;
  else {
    sortKey.value = key;
    sortDir.value = 1;
  }
  page.value = 0;
}

const classColor = cls => {
  if (!cls) return ''
  if (cls.toLowerCase().includes('pathogenic')) return 'text-red-600 bg-red-50'
  if (cls.toLowerCase().includes('benign'))     return 'text-green-600 bg-green-50'
  return 'text-gray-500 bg-gray-50'
}

// "GENE:CHROM:START-END:exon3;GENE:CHROM:START-END:exon3" → "exon3" (unique, order preserved)
function affectedExons(targetNames) {
  if (!targetNames) return '';
  const exons = targetNames.split(';').map(t => t.split(':').pop());
  return [...new Set(exons)].join(', ');
}

const ALL_COLS = [
  { key: "sample",         label: "Sample" },
  { key: "CHROM",          label: "Chr" },
  { key: "START",          label: "Start" },
  { key: "END",            label: "End" },
  { key: "gene",           label: "Gene" },
  { key: "consensus_type", label: "Type" },
  { key: "n_callers",      label: "Callers" },
  { key: "Classification", label: "Classification", noSort: true },
  { key: "target_names",   label: "Affected exons", noSort: true },
];

const cols = computed(() => props.showSample ? ALL_COLS : ALL_COLS.filter(c => c.key !== "sample"));

// Per-column text filters, keyed by column key (always includes 'sample' so a stray
// filter value isn't lost if the column is hidden and shown again)
const filters = ref(Object.fromEntries(ALL_COLS.map(c => [c.key, ''])));

// What each column filter actually matches against — mirrors what's shown in the cell
function cellSearchText(row, key) {
  switch (key) {
    case "CHROM":        return `chr${row.CHROM}`;
    case "n_callers":     return `${row.n_callers} ${row.callers ?? ''} ${formatCallers(row.callers)}`;
    case "target_names":  return `${affectedExons(row.target_names)} ${row.target_names ?? ''}`;
    default:              return String(row[key] ?? '');
  }
}

const filteredRows = computed(() =>
  props.data.filter(row =>
    cols.value.every(col => {
      const needle = filters.value[col.key]?.trim().toLowerCase();
      if (!needle) return true;
      return cellSearchText(row, col.key).toLowerCase().includes(needle);
    })
  )
);

const sorted = computed(() =>
  [...filteredRows.value].sort((a, b) => {
    const av = a[sortKey.value], bv = b[sortKey.value];
    if (sortKey.value === "CHROM")
      return (CHROM_ORDER.indexOf(String(av)) - CHROM_ORDER.indexOf(String(bv))) * sortDir.value;
    if (typeof av === "number") return (av - bv) * sortDir.value;
    return String(av ?? "").localeCompare(String(bv ?? "")) * sortDir.value;
  }),
);

const pages = computed(() => Math.max(1, Math.ceil(sorted.value.length / props.pageSize)));
const pageRows = computed(() => sorted.value.slice(page.value * props.pageSize, (page.value + 1) * props.pageSize));

function rowToTarget(r) {
  return {
    gene: r.gene, chrom: r.CHROM, start: r.START, end: r.END, sample: r.sample, type: r.consensus_type,
    classification: r.Classification, cnLabels: r.cn_labels, dosageSensitive: r.dosage_sensitive_genes,
  };
}

watch(
  filteredRows,
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

watch(() => props.pageSize, () => { page.value = 0 });

function selectRow(row) {
  selectedRows.value = [row];
  emit('navigate', [rowToTarget(row)]);
}
</script>

<template>
  <div class="overflow-x-auto">
    <table class="w-full text-xs border-collapse">
      <thead>
        <tr class="border-b border-gray-200 bg-gray-50">
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
        <tr class="border-b border-gray-200 bg-gray-50">
          <th v-for="col in cols" :key="col.key + '-filter'" class="px-2 py-1.5">
            <input
              type="text"
              v-model="filters[col.key]"
              placeholder="Filter…"
              class="w-full text-[11px] font-normal border border-gray-200 rounded px-1.5 py-1 outline-none focus:border-teal-400 bg-white text-gray-600 placeholder:text-gray-300"
              @click.stop
            />
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
          @click="selectRow(row)"
        >
          <td v-if="showSample" class="px-3 py-2 text-gray-500 font-mono text-[11px]">{{ row.sample }}</td>
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
          <td class="px-3 py-2 text-center text-gray-600 font-semibold" :title="formatCallers(row.callers)">{{ row.n_callers }}</td>
          <td class="px-3 py-2">
            <span v-if="row.Classification" :class="['px-1.5 py-0.5 rounded text-[10px] font-medium', classColor(row.Classification)]">
              {{ row.Classification }}
            </span>
            <span v-else class="text-gray-300">—</span>
          </td>
          <td class="px-3 py-2 text-gray-500 text-[11px] max-w-[220px] truncate" :title="row.target_names">
            {{ affectedExons(row.target_names) || '—' }}
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
