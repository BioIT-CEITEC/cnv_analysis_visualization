<!--
  Data Table — sortable, paginated table of all filtered CNV targets.
  Click any column header to sort. 20 rows per page.
-->
<script setup>
import { ref, computed, watch } from "vue";
import { CHROM_ORDER } from "../../composables/useFilters.js";

const props = defineProps({ data: Array });

const sortKey = ref("CHROM");
const sortDir = ref(1);
const page = ref(0);
const PAGE = 6;

// Reset to page 0 whenever the filtered data changes (e.g. a filter is applied).
// Without this, the page number stays high and slice() returns empty rows.
watch(
  () => props.data,
  () => {
    page.value = 0;
  },
);

function getGene(name) {
  return name?.split(":")[0] || "—";
}

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
    const av = a[sortKey.value],
      bv = b[sortKey.value];
    // Genomic order for CHROM: 1,2,...,22,X,Y instead of alphabetical
    if (sortKey.value === "CHROM")
      return (
        (CHROM_ORDER.indexOf(String(av)) - CHROM_ORDER.indexOf(String(bv))) *
        sortDir.value
      );
    if (typeof av === "number") return (av - bv) * sortDir.value;
    return String(av ?? "").localeCompare(String(bv ?? "")) * sortDir.value;
  }),
);

const pages = computed(() =>
  Math.max(1, Math.ceil(sorted.value.length / PAGE)),
);
const pageRows = computed(() =>
  sorted.value.slice(page.value * PAGE, (page.value + 1) * PAGE),
);

const CALLERS = [
  "cnvkit",
  "exomedepth",
  "cnmops",
  "panelcnmops",
  "freec",
  "xhmm",
  "conifer",
  "jabcontool",
  "gatk_gcnv",
];

function callerSummary(row) {
  return CALLERS.filter((c) => row[c] && row[c] !== "0").join("; ") || "—";
}

const cols = [
  { key: "sample", label: "Sample" },
  { key: "CHROM", label: "Chr" },
  { key: "START", label: "Start" },
  { key: "END", label: "End" },
  { key: "gene", label: "Gene", noSort: true },
  { key: "consensus_type", label: "Type" },
  // { key: "Count_Detected", label: "Count" },
  { key: "callers", label: "Callers", noSort: true },
];
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
              !col.noSort
                ? 'cursor-pointer hover:text-gray-600 select-none'
                : '',
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
          class="border-b border-gray-100 hover:bg-gray-50 transition-colors"
        >
          <td class="px-3 py-2 text-gray-500 font-mono text-[11px]">
            {{ row.sample }}
          </td>
          <td class="px-3 py-2 text-gray-500">chr{{ row.CHROM }}</td>
          <td class="px-3 py-2 text-gray-500 font-mono">
            {{ row.START.toLocaleString() }}
          </td>
          <td class="px-3 py-2 text-gray-500 font-mono">
            {{ row.END.toLocaleString() }}
          </td>
          <td class="px-3 py-2 text-teal-600 font-medium">
            {{ getGene(row.target_name) }}
          </td>
          <td class="px-3 py-2">
            <span
              :class="[
                'px-1.5 py-0.5 rounded text-[11px] font-semibold',
                row.consensus_type === 'DEL'
                  ? 'bg-red-50 text-red-500'
                  : row.consensus_type === 'DUP'
                    ? 'bg-blue-50 text-blue-500'
                    : '',
              ]"
              >{{ row.consensus_type }}</span
            >
          </td>

          <!-- <td class="px-3 py-2 text-center text-gray-600">
            {{ row.Count_Detected }}
          </td> -->
          <td class="px-3 py-2 text-gray-500 font-mono text-[11px]">
            {{ callerSummary(row) }}
          </td>
        </tr>
      </tbody>
    </table>

    <!-- Pagination -->
    <div
      class="flex items-center justify-center gap-4 py-4 text-gray-400 text-xs"
    >
      <button
        :disabled="page === 0"
        @click="page--"
        class="px-3 py-1.5 bg-white border border-gray-200 rounded-md hover:border-teal-400 hover:text-gray-700 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
      >
        ← Prev
      </button>
      <span>Page {{ page + 1 }} of {{ pages }}</span>
      <button
        :disabled="page >= pages - 1"
        @click="page++"
        class="px-3 py-1.5 bg-white border border-gray-200 rounded-md hover:border-teal-400 hover:text-gray-700 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
      >
        Next →
      </button>
    </div>
  </div>
</template>
