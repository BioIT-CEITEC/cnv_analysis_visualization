<!--
  Data Table — sortable, paginated table of all filtered CNV calls.
  Click any column header to sort. Always 6 rows per page.
-->
<script setup>
import { ref, computed, watch } from "vue";
import { CHROM_ORDER } from "../../composables/useFilters.js";
import { formatCallers } from "../../utils/callers.js";
import writeExcelFile from "write-excel-file/browser";

const props = defineProps({
  data: Array,
  // Sample column is only useful when rows span multiple samples (cohort view)
  showSample: { type: Boolean, default: true },
  // Row selection drives the per-sample coverage jump-to, which doesn't apply in
  // cohort ("All") view — disable checkboxes/selection there.
  allowSelection: { type: Boolean, default: true },
});
const emit = defineEmits(['navigate']);

const PAGE_SIZE = 6;

const sortKey = ref("CHROM");
const sortDir = ref(1);
const page = ref(0);
const selectedRows = ref([]);
const warning = ref('');
let warningTimer = null;

function showWarning(msg) {
  warning.value = msg;
  clearTimeout(warningTimer);
  warningTimer = setTimeout(() => { warning.value = ''; }, 4000);
}

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

// filter: 'text' (free-text substring match) | 'select' (exact-match dropdown) | 'none' (no filter UI)
const ALL_COLS = [
  { key: "sample",         label: "Sample",         filter: "text" },
  { key: "CHROM",          label: "Chr",             filter: "text" },
  { key: "START",          label: "Start",           filter: "none" },
  { key: "END",            label: "End",             filter: "none" },
  { key: "gene",           label: "Gene",            filter: "text" },
  { key: "consensus_type", label: "Type",            filter: "select" },
  { key: "n_callers",      label: "Callers",         filter: "none" },
  { key: "Classification", label: "Classification",  filter: "select", noSort: true },
  { key: "target_names",   label: "Affected exons",  filter: "text", noSort: true },
];

const cols = computed(() => props.showSample ? ALL_COLS : ALL_COLS.filter(c => c.key !== "sample"));

// Per-column filters, keyed by column key (always includes 'sample' so a stray
// filter value isn't lost if the column is hidden and shown again)
const filters = ref(Object.fromEntries(ALL_COLS.map(c => [c.key, ''])));

const typeOptions           = computed(() => [...new Set(props.data.map(r => r.consensus_type).filter(Boolean))].sort());
const classificationOptions = computed(() => [...new Set(props.data.map(r => r.Classification).filter(Boolean))].sort());

// What each free-text column filter actually matches against — mirrors what's shown in the cell
function cellSearchText(row, key) {
  switch (key) {
    case "CHROM":        return `chr${row.CHROM}`;
    case "target_names":  return `${affectedExons(row.target_names)} ${row.target_names ?? ''}`;
    default:              return String(row[key] ?? '');
  }
}

const filteredRows = computed(() =>
  props.data.filter(row =>
    cols.value.every(col => {
      const needle = filters.value[col.key];
      if (!needle) return true;
      if (col.filter === 'select') return row[col.key] === needle;
      return cellSearchText(row, col.key).toLowerCase().includes(needle.trim().toLowerCase());
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

const pages = computed(() => Math.max(1, Math.ceil(sorted.value.length / PAGE_SIZE)));
const pageRows = computed(() => sorted.value.slice(page.value * PAGE_SIZE, (page.value + 1) * PAGE_SIZE));

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

// Multiple rows can be selected at once, but only when they all share the same
// chromosome — mixing chromosomes doesn't make sense for the coverage jump-to view.
function toggleRow(row) {
  if (!props.allowSelection) return;
  const idx = selectedRows.value.indexOf(row);
  if (idx >= 0) {
    selectedRows.value = selectedRows.value.filter((_, i) => i !== idx);
  } else {
    const current = selectedRows.value[0];
    if (current && current.CHROM !== row.CHROM) {
      showWarning(`Deselect the current chr${current.CHROM} variant(s) before selecting a variant on a different chromosome.`);
      return;
    }
    selectedRows.value = [...selectedRows.value, row];
  }
  emit('navigate', selectedRows.value.map(rowToTarget));
}

// Exports every row currently passing the filters (sorted, not just the visible page)
async function downloadXlsx() {
  const columns = cols.value.map(col => ({
    header: col.label,
    cell: (row) => {
      switch (col.key) {
        case "CHROM":         return { value: `chr${row.CHROM}`, type: String };
        case "START":         return { value: row.START, type: Number };
        case "END":           return { value: row.END, type: Number };
        case "n_callers":     return { value: row.n_callers, type: Number };
        case "target_names":  return { value: affectedExons(row.target_names), type: String };
        default:              return { value: String(row[col.key] ?? ''), type: String };
      }
    },
  }));
  await writeExcelFile(sorted.value, { columns }).toFile('cnv_calls.xlsx');
}

defineExpose({ downloadXlsx });
</script>

<template>
  <div class="overflow-x-auto">
    <p v-if="warning" class="mb-2 px-3 py-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md">
      {{ warning }}
    </p>
    <table class="w-full text-xs border-collapse">
      <thead>
        <tr class="border-b border-gray-200 bg-gray-50">
          <th v-if="allowSelection" class="px-3 py-1.5"></th>
          <th v-for="col in cols" :key="col.key + '-filter'" class="px-2 py-1.5">
            <select
              v-if="col.filter === 'select'"
              v-model="filters[col.key]"
              class="w-full text-[11px] font-normal border border-gray-200 rounded px-1 py-1 outline-none focus:border-teal-400 bg-white text-gray-600 cursor-pointer"
              @click.stop
            >
              <option value="">All</option>
              <option
                v-for="opt in (col.key === 'consensus_type' ? typeOptions : classificationOptions)"
                :key="opt"
                :value="opt"
              >{{ opt }}</option>
            </select>
            <input
              v-else-if="col.filter === 'text'"
              type="text"
              v-model="filters[col.key]"
              placeholder="Filter…"
              class="w-full text-[11px] font-normal border border-gray-200 rounded px-1.5 py-1 outline-none focus:border-teal-400 bg-white text-gray-600 placeholder:text-gray-300"
              @click.stop
            />
          </th>
        </tr>
        <tr class="border-b border-gray-200 bg-gray-50">
          <th v-if="allowSelection" class="px-3 py-2 w-8 text-center text-[10px] uppercase tracking-wider font-semibold text-gray-400">
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
            'border-b border-gray-100 transition-colors',
            allowSelection ? 'cursor-pointer' : '',
            allowSelection && selectedRows.includes(row) ? 'bg-teal-50 hover:bg-teal-50' : 'hover:bg-gray-50',
          ]"
          @click="toggleRow(row)"
        >
          <td v-if="allowSelection" class="px-3 py-2 text-center">
            <span :class="[
              'inline-flex items-center justify-center w-4 h-4 rounded border transition-colors',
              selectedRows.includes(row)
                ? 'bg-teal-500 border-teal-500 text-white'
                : 'border-gray-300 bg-white',
            ]">
              <svg v-if="selectedRows.includes(row)" class="w-2.5 h-2.5" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5"/></svg>
            </span>
          </td>
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
