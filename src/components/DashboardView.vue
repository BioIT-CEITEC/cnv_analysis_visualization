<script setup>
import { computed, ref } from "vue";
import ceitecLogo from "../assets/ceitec-logo.png";
import { useFilters, CHROM_ORDER } from "../composables/useFilters.js";
import { coverageSampleList } from "../composables/useCoverage.js";
import { exportFormat, exportDPI } from "../composables/useExportSettings.js";
import { downloadChartImage } from "../utils/exportChart.js";
import FilterBar from "./FilterBar.vue";
import GenomeOverview from "./charts/GenomeOverview.vue";
import CnvTypeBar from "./charts/CnvTypePie.vue";
import CallerConcordance from "./charts/CallerConcordance.vue";
import CopyNumberScatter from "./charts/CopyNumberScatter.vue";
import DataTable from "./charts/DataTable.vue";
import GenomeCoverage from "./charts/GenomeCoverage.vue";
import CohortTopGenes from "./charts/CohortTopGenes.vue";
import ChartInfo from "./ChartInfo.vue";
import DownloadButton from "./DownloadButton.vue";

const props = defineProps({ data: Array });

const dataRef = computed(() => props.data);

const {
  selectedSample,
  availableSamples,
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

// "All (cohort)" mode: show a cohort-wide gene summary instead of per-sample coverage.
const isCohortView = computed(() => selectedSample.value === 'all');

const sampleList = coverageSampleList;
const sidebarOpen = ref(true);
const mobileSidebarOpen = ref(false);

const coverageJumpTo  = ref(null)
const coverageSection = ref(null)

// Template refs to the child chart/table components, used to trigger their downloads
const dataTableRef     = ref(null)
const pieChartRef      = ref(null)
const genomeCoverageRef = ref(null)
const topGenesRef       = ref(null)

function downloadTable() {
  dataTableRef.value?.downloadXlsx()
}
function downloadPieChart() {
  downloadChartImage(pieChartRef.value?.chartRef, 'del_dup_pie_chart')
}
function downloadCoverageChart() {
  downloadChartImage(genomeCoverageRef.value?.chartRef, 'genome_coverage')
}
function downloadTopGenesChart() {
  downloadChartImage(topGenesRef.value?.chartRef, isCohortView.value ? 'cohort_gene_summary' : 'top_affected_genes')
}

function onTableNavigate(targets) {
  // In cohort ("All") view the table's own data changes (it now spans every sample),
  // which re-fires its auto-select-first-row navigation — don't let that silently
  // kick us back to a single sample and out of the cohort summary.
  if (isCohortView.value) return
  coverageJumpTo.value = targets && targets.length ? targets : null
  if (targets && targets.length) {
    const last = targets[targets.length - 1]
    if (last.sample) selectedSample.value = last.sample
    coverageSection.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
}


</script>

<template>
  <div class="flex h-full overflow-hidden bg-gray-50">

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
      <div class="px-4 py-4 border-b border-gray-100">
        <FilterBar
          :samples="availableSamples"
          :sample="selectedSample"
          @update:sample="selectedSample = $event"
          :result-count="filtered.length"
          @reset="reset"
        />
      </div>

      <!-- Export Settings — applies to every plot's download button -->
      <div class="flex-1 px-4 py-4 overflow-y-auto">
        <div class="flex flex-col gap-3">
          <span class="text-[10px] uppercase tracking-widest text-gray-400 font-semibold">Export Settings</span>

          <div class="flex flex-col gap-1">
            <label class="text-[10px] uppercase tracking-widest text-gray-400 font-semibold">Format</label>
            <select
              v-model="exportFormat"
              class="w-full bg-white border border-gray-300 text-gray-700 text-sm rounded-md px-2 py-1.5 outline-none focus:border-teal-500 cursor-pointer"
            >
              <option value="png">PNG</option>
              <option value="jpeg">JPEG</option>
            </select>
          </div>

          <div class="flex flex-col gap-1">
            <label class="text-[10px] uppercase tracking-widest text-gray-400 font-semibold">Resolution</label>
            <select
              v-model.number="exportDPI"
              class="w-full bg-white border border-gray-300 text-gray-700 text-sm rounded-md px-2 py-1.5 outline-none focus:border-teal-500 cursor-pointer"
            >
              <option :value="72">72 DPI</option>
              <option :value="96">96 DPI</option>
              <option :value="150">150 DPI</option>
              <option :value="300">300 DPI</option>
            </select>
          </div>

          <p class="text-[11px] text-gray-400">Applies when downloading any plot.</p>
        </div>
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
              <h3 class="text-[10px] uppercase tracking-widest text-gray-400 font-semibold">
                {{ isCohortView ? 'Full Cohort Summary' : `${selectedSample} Variants Summary` }}
              </h3>
              <div class="flex items-center gap-1">
                <ChartInfo
                  file="all_samples_smoothed.tsv"
                  :columns="['sample','CHROM','START','END','BED_gene_name','type','n_callers','callers','classifications','target_names']"
                  description="Lists all CNV calls passing the current filters. Each row is one consensus CNV event. The Callers column shows how many tools detected it; Classification shows the clinical significance. Sortable by any column, with a filter per column above the header (text for most, a dropdown for Type/Classification). 6 rows per page."
                />
                <DownloadButton title="Download as .xlsx" @click="downloadTable" />
              </div>
            </div>
            <div style="min-width: 560px">
              <DataTable ref="dataTableRef" :data="filtered" :show-sample="isCohortView" :allow-selection="!isCohortView" @navigate="onTableNavigate" />
            </div>
          </div>
          <div class="bg-white border border-gray-200 rounded-xl p-5 overflow-x-auto">
            <div class="flex items-center justify-between mb-4">
              <h3 class="text-[10px] uppercase tracking-widest text-gray-400 font-semibold">Variant Type Distribution</h3>
              <div class="flex items-center gap-1">
                <ChartInfo
                  file="all_samples_smoothed.tsv"
                  :columns="['type','CHROM']"
                  description="Nested pie chart. Inner ring: total DEL vs DUP counts across all filtered targets. Outer ring: per-chromosome breakdown, colored by type (light red = DEL, light blue = DUP). Both rings reflect active filters."
                />
                <DownloadButton title="Download chart image" @click="downloadPieChart" />
              </div>
            </div>
            <div style="min-width: 280px">
              <CnvTypeBar ref="pieChartRef" :data="filtered" :chrom-order="CHROM_ORDER" />
            </div>
          </div>
        </div>

        <!-- Genome Coverage — always shown; prompts for a specific sample when "All" is selected -->
        <div ref="coverageSection" class="bg-white border border-gray-200 rounded-xl p-5 overflow-x-auto">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-[10px] uppercase tracking-widest text-gray-400 font-semibold">Genome Coverage</h3>
            <div class="flex items-center gap-1">
              <ChartInfo
                :file="['*.region_coverage.tsv', 'all_samples_smoothed.tsv']"
                :columns="['chrom','start','end','gene','avg_coverage','region_length','bases_covered','fraction_covered','cn_labels','classifications']"
                description="Average read depth per target region for the selected sample and gene. Each bar is one exon/target region. Hovering a region that overlaps the selected table row also shows its per-caller CN labels, classification, and dosage-sensitivity. Toggle 'Cohort avg' to overlay a transparent red line showing the average depth per region across every loaded sample. Select a specific sample from the sidebar to view this plot."
              />
              <DownloadButton title="Download chart image" @click="downloadCoverageChart" />
            </div>
          </div>
          <GenomeCoverage
            ref="genomeCoverageRef"
            :sample-list="sampleList"
            :active-sample-id="selectedSample"
            :jump-to="coverageJumpTo"
          />
        </div>

        <!-- Top Affected Genes — per-sample when a sample is selected, cohort-wide for "All" -->
        <div class="bg-white border border-gray-200 rounded-xl p-5 overflow-x-auto">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-[10px] uppercase tracking-widest text-gray-400 font-semibold">
              {{ isCohortView ? 'Top Affected Genes - Full Cohort' : `Top Affected Genes ${selectedSample}` }}
            </h3>
            <div class="flex items-center gap-1">
              <ChartInfo
                file="all_samples_smoothed.tsv"
                :columns="['BED_gene_name','type']"
                :description="isCohortView
                  ? `Horizontal stacked bar of the 15 most frequently affected genes across every sample in the loaded dataset, split into DEL (red) and DUP (blue) call counts.`
                  : `Horizontal stacked bar of the 15 most frequently affected genes within the selected sample, split into DEL (red) and DUP (blue) call counts.`"
              />
              <DownloadButton title="Download chart image" @click="downloadTopGenesChart" />
            </div>
          </div>
          <CohortTopGenes ref="topGenesRef" :data="filtered" />
        </div>

      </div>
    </main>

  </div>
</template>
