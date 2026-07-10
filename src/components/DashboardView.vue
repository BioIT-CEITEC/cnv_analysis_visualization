<script setup>
import { computed, ref } from "vue";
import ceitecLogo from "../assets/ceitec-logo.png";
import { useFilters, CHROM_ORDER } from "../composables/useFilters.js";
import { coverageSampleList } from "../composables/useCoverage.js";
import FilterBar from "./FilterBar.vue";
import GenomeOverview from "./charts/GenomeOverview.vue";
import CnvTypeBar from "./charts/CnvTypePie.vue";
import CallerConcordance from "./charts/CallerConcordance.vue";
import CopyNumberScatter from "./charts/CopyNumberScatter.vue";
import DataTable from "./charts/DataTable.vue";
import GenomeCoverage from "./charts/GenomeCoverage.vue";
import ZScoreScatter from "./charts/ZScoreScatter.vue";
import ChartInfo from "./ChartInfo.vue";

const props = defineProps({ data: Array, filename: String });

const dataRef = computed(() => props.data);

const {
  selectedSample,
  selectedChrom,
  selectedType,
  minConcordance,
  geneSearch,
  selectedCaller,
  availableSamples,
  availableChromosomes,
  availableGenes,
  filtered,
  reset,
} = useFilters(dataRef);

const stats = computed(() => {
  const f = filtered.value;
  const genes = new Set(f.map(r => r.gene).filter(Boolean));
  return {
    total: f.length,
    del: f.filter((r) => r.consensus_type === "DEL").length,
    dup: f.filter((r) => r.consensus_type === "DUP").length,
    genes: genes.size,
  };
});

const sampleList = coverageSampleList;
const sidebarOpen = ref(true);
const mobileSidebarOpen = ref(false);

</script>

<template>
  <div class="flex h-screen overflow-hidden bg-gray-50">

    <!-- ── Mobile backdrop ── -->
    <div
      v-if="mobileSidebarOpen"
      class="fixed inset-0 bg-black/40 z-30 md:hidden"
      @click="mobileSidebarOpen = false"
    />

    <!-- ── Sidebar ── -->
    <aside
      :class="[
        'flex-shrink-0 border-r border-gray-200 flex flex-col overflow-x-hidden transition-all duration-200',
        'fixed inset-y-0 left-0 z-40 md:static md:z-auto',
        sidebarOpen ? 'md:w-56' : 'md:w-10',
        'w-64',
        mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
      ]"
      style="background:#fff"
    >

      <!-- Logo + toggle button -->
      <div class="flex items-center justify-between border-b border-gray-100 px-3 py-3 min-h-[56px]">
        <img :src="ceitecLogo" alt="CEITEC BioIT" class="h-12 object-contain object-left flex-1 min-w-0" />
        <button
          @click="sidebarOpen = !sidebarOpen; mobileSidebarOpen = false"
          class="ml-1 flex-shrink-0 w-6 h-6 flex items-center justify-center rounded text-gray-400 hover:text-[#21a8c2] hover:bg-[#21a8c20a] transition-colors"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" class="w-4 h-4">
            <path v-if="sidebarOpen" d="M15 18l-6-6 6-6"/>
            <path v-else d="M9 18l6-6-6-6"/>
          </svg>
        </button>
      </div>

      <!-- Content — hidden when collapsed (desktop only) -->
      <template v-if="sidebarOpen || mobileSidebarOpen">
      <div class="px-4 py-3 border-b border-gray-100">
        <p v-if="filename" class="text-[11px] truncate" :title="filename" style="color:#101828;opacity:0.5">{{ filename }}</p>
      </div>

      <!-- Stat cards -->
      <div class="px-4 py-4 border-b border-gray-100">
        <div class="grid grid-cols-2 gap-2">
          <div
            v-for="s in [
              { label: 'Targets', value: stats.total, cls: 'text-gray-800' },
              { label: 'DEL',     value: stats.del,   cls: 'text-red-500'  },
              { label: 'DUP',     value: stats.dup,   cls: 'text-blue-500' },
              { label: 'Genes',   value: stats.genes, cls: 'text-teal-600' },
            ]"
            :key="s.label"
            class="flex flex-col items-center bg-gray-50 rounded-lg py-2 px-1"
          >
            <span :class="['text-lg font-bold tabular-nums leading-tight', s.cls]">{{ s.value }}</span>
            <span class="text-[9px] uppercase tracking-widest text-gray-400 mt-0.5">{{ s.label }}</span>
          </div>
        </div>
      </div>

      <!-- Filters -->
      <div class="flex-1 px-4 py-4 overflow-y-auto">
        <FilterBar
          :samples="availableSamples"
          :sample="selectedSample"
          @update:sample="selectedSample = $event"
          :chromosomes="availableChromosomes"
          :chrom="selectedChrom"
          @update:chrom="selectedChrom = $event"
          :type="selectedType"
          @update:type="selectedType = $event"
          :concordance="minConcordance"
          @update:concordance="minConcordance = $event"
          :caller="selectedCaller"
          @update:caller="selectedCaller = $event"
          :gene-list="availableGenes"
          :gene="geneSearch"
          @update:gene="geneSearch = $event"
          :result-count="filtered.length"
          @reset="reset"
        />
      </div>
      </template>
    </aside>

    <!-- ── Main content ── -->
    <main class="flex-1 overflow-y-auto min-w-0">

      <!-- Mobile top bar -->
      <div class="md:hidden sticky top-0 z-20 flex items-center justify-between px-4 py-3 bg-white border-b border-gray-200">
        <img :src="ceitecLogo" alt="CEITEC BioIT" class="h-8 object-contain" />
        <button
          @click="mobileSidebarOpen = true"
          class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors border border-gray-200"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" class="w-4 h-4">
            <path d="M3.75 6.75h16.5M3.75 12h16.5M3.75 17.25h16.5"/>
          </svg>
          <span class="text-xs font-medium">Filter</span>
        </button>
      </div>

      <div class="p-4 flex flex-col gap-4">

        <!-- Row 1: Table + Pie — stacks on mobile -->
        <div class="grid gap-4 grid-cols-1 md:grid-cols-[2fr_1fr]">
          <div class="bg-white border border-gray-200 rounded-xl p-5 overflow-x-auto">
            <div class="flex items-center justify-between mb-4">
              <h3 class="text-[10px] uppercase tracking-widest text-gray-400 font-semibold">Data Table</h3>
              <ChartInfo
                file="merged_target_consensus.tsv"
                :columns="['sample','CHROM','START','END','target_name','consensus_type','Count_Detected','cnvkit','exomedepth','cnmops','panelcnmops','freec','xhmm','conifer','jabcontool','gatk_gcnv']"
                description="Lists all CNV targets passing the current filters. Each row is one target region. The Callers column shows which of the 9 callers detected the event (DEL or DUP). Sortable by any column; 6 rows per page."
              />
            </div>
            <div style="min-width: 560px">
              <DataTable :data="filtered" />
            </div>
          </div>
          <div class="bg-white border border-gray-200 rounded-xl p-5 overflow-x-auto">
            <div class="flex items-center justify-between mb-4">
              <h3 class="text-[10px] uppercase tracking-widest text-gray-400 font-semibold">DEL / DUP Pie Chart</h3>
              <ChartInfo
                file="merged_target_consensus.tsv"
                :columns="['consensus_type','CHROM']"
                description="Nested pie chart. Inner ring: total DEL vs DUP counts across all filtered targets. Outer ring: per-chromosome breakdown, colored by type (light red = DEL, light blue = DUP). Both rings reflect active filters."
              />
            </div>
            <div style="min-width: 280px">
              <CnvTypeBar :data="filtered" :chrom-order="CHROM_ORDER" />
            </div>
          </div>
        </div>

        <!-- Z-Score Scatter -->
        <div class="bg-white border border-gray-200 rounded-xl p-5 overflow-x-auto">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-[10px] uppercase tracking-widest text-gray-400 font-semibold">Genome-Wide Z-Score</h3>
            <ChartInfo
              file="merged_target_consensus.tsv"
              :columns="['cnvkit_CN','exomedepth_CN','cnmops_CN','panelcnmops_CN','freec_CN','xhmm_CN','conifer_CN','jabcontool_CN','gatk_gcnv_CN','CHROM','START','consensus_type']"
              description="Each point is one target region. Mean CN is computed across all callers that made a call. Z-score = (mean CN − global mean) / std dev. Red = DEL, blue = DUP, grey = CN≈2 (normal diploid). Points with |z| > 2 are labeled with their gene name."
            />
          </div>
          <div style="min-width: 600px">
            <ZScoreScatter :data="filtered" :chrom-order="CHROM_ORDER" />
          </div>
        </div>

        <!-- Genome Coverage -->
        <div class="bg-white border border-gray-200 rounded-xl p-5 overflow-x-auto">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-[10px] uppercase tracking-widest text-gray-400 font-semibold">Genome Coverage</h3>
            <ChartInfo
              :file="['*.per_region_coverage.tsv']"
              :columns="['chrom','region_start','region_end','gene','pos_in_region','depth']"
              description="Per-base read depth for the selected sample and gene. Each target region is a continuous segment separated by gaps. Depth color: red ≤ 20×, amber 20–100×, grey > 100×. You can also upload a BED file to visualize coverage for custom regions instead of a gene."
            />
          </div>
          <GenomeCoverage
            :sample-list="sampleList"
            :active-sample-id="selectedSample"
          />
        </div>

      </div>
    </main>

  </div>
</template>
