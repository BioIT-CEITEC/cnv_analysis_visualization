<!--
  Genome Coverage — IGV-style depth track for a selected gene.
  Shows per-base read depth across all exon regions of the gene.
  Exons are laid out continuously (introns omitted); vertical lines mark boundaries.
  Reference lines: 20x (red dashed), 100x (amber dashed).
-->
<script setup>
import { ref, computed, watch } from 'vue'
import { VChart } from '../../utils/echarts.js'
import { useCoverage, coverageSelectedGene, coverageGeneList } from '../../composables/useCoverage.js'

const props = defineProps({
  sampleList:     Array,
  activeSampleId: { type: String, default: '' },
})

const { getGeneData, getRegionData, loading, error, loaded, load } = useCoverage()

const selectedChrom   = ref('')
const selectedBedGene = ref('')

// BED mode
const bedInput    = ref(null)
const bedRegions  = ref([])   // [{chrom, start, end, name}]
const bedFileName = ref('')

function parseBed(text) {
  return text.split('\n')
    .filter(l => l && !l.startsWith('#') && !l.startsWith('track') && !l.startsWith('browser'))
    .map(l => {
      const cols = l.split('\t')
      if (cols.length < 3) return null
      const start = parseInt(cols[1])
      const end   = parseInt(cols[2])
      if (isNaN(start) || isNaN(end)) return null
      return { chrom: cols[0], start, end, name: cols[3]?.trim() || `${cols[0]}:${start}-${end}` }
    })
    .filter(Boolean)
}

async function onBedFile(e) {
  const file = e.target.files[0]
  if (!file) return
  const text = await file.text()
  bedRegions.value  = parseBed(text)
  bedFileName.value = file.name
  selectedBedGene.value = ''
  e.target.value = ''
}

function clearBed() {
  bedRegions.value      = []
  bedFileName.value     = ''
  selectedBedGene.value = ''
}

function openBedPicker() {
  bedInput.value?.click()
}

const bedMode = computed(() => bedRegions.value.length > 0)

// Unique gene names from BED file (4th column used as gene name)
const bedGeneList = computed(() => [...new Set(bedRegions.value.map(r => r.name))].sort())

// Load coverage whenever the sidebar sample changes
watch(
  () => props.activeSampleId,
  async (sid) => {
    if (!sid || sid === 'all') return
    await load(sid)
  },
  { immediate: true }
)

// All regions for gene mode
const allExons = computed(() => {
  const rows = getGeneData(coverageSelectedGene.value)
  const regionMap = new Map()
  for (const row of rows) {
    const key = `${row.gene}:${row.chrom}:${row.start}-${row.end}`
    if (!regionMap.has(key)) {
      regionMap.set(key, { chrom: row.chrom, start: row.start, end: row.end, gene: row.gene, bases: [] })
    }
    regionMap.get(key).bases.push({ pos: row.start + row.pos - 1, depth: row.depth })
  }
  return [...regionMap.values()]
    .sort((a, b) => a.chrom.localeCompare(b.chrom, undefined, { numeric: true }) || a.start - b.start)
    .map(ex => ({ ...ex, bases: ex.bases.sort((a, b) => a.pos - b.pos) }))
})

// BED regions filtered by selected gene (name column)
const activeBedRegions = computed(() => {
  if (!selectedBedGene.value) return bedRegions.value
  return bedRegions.value.filter(r => r.name === selectedBedGene.value)
})

// All regions for BED mode
const allBedRegions = computed(() =>
  bedMode.value ? getRegionData(activeBedRegions.value) : []
)

// Unified source — switches between gene and BED mode
const allRegions = computed(() => bedMode.value ? allBedRegions.value : allExons.value)

// Chromosomes available in the current view
const availableChroms = computed(() => [...new Set(allRegions.value.map(e => e.chrom))])

// Reset local chrom when gene or BED regions change
watch([coverageSelectedGene, allBedRegions], () => {
  selectedChrom.value = availableChroms.value[0] ?? ''
})
watch(availableChroms, (chroms) => {
  if (!chroms.includes(selectedChrom.value)) {
    selectedChrom.value = chroms[0] ?? ''
  }
})

// Regions filtered to the selected chromosome
const regions = computed(() =>
  allRegions.value.filter(e => e.chrom === selectedChrom.value)
)

// Flatten all bases into a continuous series for the chart
const chartInfo = computed(() => {
  const points     = []   // [xIdx, depth, genomicPos, regionLabel]
  const posAtIndex = []   // posAtIndex[xIdx] = real genomic position
  let idx = 0

  regions.value.forEach((region) => {
    for (const base of region.bases) {
      const label = bedMode.value ? region.name : (region.gene || '')
      points.push([idx, base.depth, base.pos, label])
      posAtIndex[idx] = base.pos
      idx++
    }
  })

  return { points, posAtIndex }
})

const stats = computed(() => {
  const depths = chartInfo.value.points.map(p => p[1])
  if (!depths.length) return null
  let sum = 0, min = Infinity, max = -Infinity, ge20 = 0, ge100 = 0
  for (const d of depths) {
    sum += d
    if (d < min) min = d
    if (d > max) max = d
    if (d >= 20) ge20++
    if (d >= 100) ge100++
  }
  const n = depths.length
  return {
    mean: (sum / n).toFixed(0),
    min,
    max,
    pct20:  (ge20  / n * 100).toFixed(1),
    pct100: (ge100 / n * 100).toFixed(1),
    bases:  n
  }
})

const option = computed(() => {
  const { points, posAtIndex } = chartInfo.value

  return {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'line', lineStyle: { color: '#d1d5db', width: 1 } },
      backgroundColor: '#ffffff',
      borderColor: '#e5e7eb',
      textStyle: { color: '#1f2937', fontSize: 12 },
      formatter(params) {
        const [, depth, pos, label] = params[0].data
        const chromStr = regions.value[0]?.chrom ? `chr${regions.value[0].chrom}:` : ''
        const labelStr = label ? `${label} &nbsp;|&nbsp; ` : ''
        return `${chromStr}${pos.toLocaleString()}<br/>${labelStr}Depth: <b>${depth}x</b>`
      }
    },
    visualMap: {
      show: false,
      type: 'piecewise',
      dimension: 1,
      seriesIndex: 0,
      pieces: [
        { lte: 20,              color: '#ef4444' },
        { gt: 20,  lte: 100,   color: '#f59e0b' },
        { gt: 100,              color: '#6b7280' }
      ]
    },
    dataZoom: [
      { type: 'inside', xAxisIndex: 0, filterMode: 'none' },
      {
        type: 'slider', xAxisIndex: 0, bottom: 8, height: 20,
        borderColor: '#e5e7eb', fillerColor: 'rgba(33,168,194,0.12)',
        handleStyle: { color: '#21a8c2' },
        textStyle: { color: '#9ca3af', fontSize: 9 },
      }
    ],
    grid: { top: 24, left: 64, right: 16, bottom: 58 },
    xAxis: {
      type: 'value',
      min: 0,
      max: points.length - 1,
      axisLabel: {
        color: '#9ca3af',
        fontSize: 10,
        rotate: 45,
        formatter: v => {
          const pos = posAtIndex[Math.round(v)]
          if (pos == null) return ''
          return pos >= 1e6
            ? `${(pos / 1e6).toFixed(3)}M`
            : pos.toLocaleString()
        }
      },
      axisTick:  { show: true, lineStyle: { color: '#e5e7eb' } },
      axisLine:  { show: false },
      splitLine: { show: false },
      name: selectedChrom.value ? `chr${selectedChrom.value}` : '',
      nameLocation: 'middle',
      nameGap: 52,
      nameTextStyle: { color: '#6b7280', fontSize: 11, fontWeight: 'bold' }
    },
    yAxis: {
      type: 'value',
      name: 'Depth (×)',
      nameLocation: 'middle',
      nameGap: 40,
      nameTextStyle: { color: '#6b7280', fontSize: 11, fontWeight: 'bold' },
      axisLabel: { color: '#9ca3af', fontSize: 10 },
      splitLine: { lineStyle: { color: '#f3f4f6' } }
    },
    series: [{
      type: 'line',
      data: points,
      showSymbol: false,
      lineStyle: { width: 0 },
      areaStyle: { opacity: 0.85 },
      markLine: {
        silent: true,
        symbol: 'none',
        data: [
          {
            yAxis: 20,
            lineStyle: { color: '#ef4444', type: 'dashed', width: 1.5 },
            label: { position: 'insideStartTop', formatter: '20×', color: '#ef4444', fontSize: 10 }
          },
          {
            yAxis: 100,
            lineStyle: { color: '#f59e0b', type: 'dashed', width: 1.5 },
            label: { position: 'insideStartTop', formatter: '100×', color: '#f59e0b', fontSize: 10 }
          }
        ]
      }
    }]
  }
})
</script>

<template>
  <div>

    <!-- Alert: no sample selected -->
    <div
      v-if="!activeSampleId || activeSampleId === 'all'"
      class="h-[280px] flex flex-col items-center justify-center gap-3 text-center"
    >
      <svg class="w-10 h-10 text-gray-300" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24">
        <path d="M15.042 21.672L13.684 16.6m0 0l-2.51 2.225.569-9.47 5.227 7.917-3.286-.672zM12 2.25V4.5m5.834.166l-1.591 1.591M20.25 10.5H18M7.757 14.743l-1.59 1.59M6 10.5H3.75m4.007-4.243l-1.59-1.59"/>
      </svg>
      <p class="text-sm text-gray-500 max-w-xs">
        To view coverage data, please select a specific sample from the sidebar. Currently showing <b>All samples</b>.
      </p>
    </div>

    <div v-else style="min-width: 640px">
      <!-- Controls -->
      <div class="flex items-center gap-3 mb-4 flex-wrap">

        <!-- Coverage gene selector (gene mode only) -->
        <select
          v-if="!bedMode && coverageGeneList.length"
          v-model="coverageSelectedGene"
          class="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-100"
        >
          <option value="">All genes</option>
          <option v-for="g in coverageGeneList" :key="g" :value="g">{{ g }}</option>
        </select>

        <!-- Chromosome selector — immediately after gene selector -->
        <select
          v-if="availableChroms.length > 1 && regions.length"
          v-model="selectedChrom"
          class="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-100"
        >
          <option v-for="c in availableChroms" :key="c" :value="c">chr{{ c }}</option>
        </select>

        <!-- BED gene filter (only in BED mode with data) -->
        <select
          v-if="bedMode && bedGeneList.length > 1 && regions.length"
          v-model="selectedBedGene"
          class="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-100"
        >
          <option value="">All regions ({{ bedRegions.length }})</option>
          <option v-for="g in bedGeneList" :key="g" :value="g">{{ g }}</option>
        </select>

        <!-- BED file upload -->
        <input ref="bedInput" type="file" accept=".bed,.txt" class="hidden" @change="onBedFile" />
        <button
          @click="openBedPicker"
          class="text-sm px-3 py-1.5 border border-dashed border-gray-300 rounded-lg text-gray-500 hover:border-teal-400 hover:text-teal-600 transition-colors bg-white"
        >
          {{ bedMode ? '↺ Replace BED' : '+ Upload BED' }}
        </button>
        <template v-if="bedMode">
          <span class="text-xs text-teal-600 font-medium">{{ bedFileName }}</span>
          <span class="text-xs text-gray-400">({{ bedRegions.length }} regions)</span>
          <button @click="clearBed" class="text-xs text-gray-400 hover:text-red-500 transition-colors">✕ Clear</button>
        </template>

        <span v-if="loading" class="text-xs text-gray-400 animate-pulse">Loading coverage data…</span>
        <span v-if="error" class="text-xs text-red-500">{{ error }}</span>

        <!-- Stats chips -->
        <template v-if="stats">
          <span class="text-xs text-gray-500">
            <span class="font-semibold text-gray-700">{{ stats.bases.toLocaleString() }}</span> bp
          </span>
          <span class="flex items-center gap-3 text-xs">
            <span class="flex items-center gap-1"><span class="inline-block w-3 h-3 rounded-sm bg-[#ef4444]"></span>≤ 20×</span>
            <span class="flex items-center gap-1"><span class="inline-block w-3 h-3 rounded-sm bg-[#f59e0b]"></span>20–100×</span>
            <span class="flex items-center gap-1"><span class="inline-block w-3 h-3 rounded-sm bg-[#6b7280]"></span>&gt; 100×</span>
          </span>
        </template>
      </div>

      <!-- Chart -->
      <VChart
        v-if="loaded && regions.length"
        :option="option"
        autoresize
        style="width: 100%; height: 320px"
      />

      <!-- Empty state -->
      <div
        v-else-if="!loading"
        class="h-[280px] flex items-center justify-center text-sm text-gray-400"
      >
        <span v-if="bedMode && loaded">No coverage data matched the BED regions for this sample</span>
        <span v-else>No coverage data</span>
      </div>
    </div>

  </div>
</template>
