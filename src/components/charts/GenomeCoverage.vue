<!--
  Genome Coverage — per-region average depth line/area chart.
  Shows average read depth per target region for the selected gene/sample.
  Reference lines: 20x (red dashed), 100x (amber dashed).
  Depth color: red ≤ 20×, amber 20–100×, grey > 100×.
-->
<script setup>
import { ref, computed, watch, nextTick } from 'vue'
import { VChart } from '../../utils/echarts.js'
import { useCoverage, coverageSelectedGene, coverageGeneList } from '../../composables/useCoverage.js'

const props = defineProps({
  sampleList:     Array,
  activeSampleId: { type: String, default: '' },
  jumpTo:         { default: null }, // Array of { gene, chrom, start, end, type } | null
})

const { getGeneData, getRegionData, loading, error, loaded, load, currentSample } = useCoverage()

const chartRef        = ref(null)
const selectedChrom   = ref('')
const selectedBedGene = ref('')
const highlightGene   = ref('')

// Gene combobox
const geneSearch       = ref('')
const geneDropdownOpen = ref(false)
const geneInputRef     = ref(null)

const filteredCoverageGeneList = computed(() => {
  if (!geneSearch.value) return coverageGeneList.value
  const q = geneSearch.value.toLowerCase()
  return coverageGeneList.value.filter(g => g.toLowerCase().includes(q))
})

function onGeneInputFocus() {
  geneSearch.value = coverageSelectedGene.value || ''
  geneDropdownOpen.value = true
}
function onGeneInput() {
  geneDropdownOpen.value = true
}
function onGeneBlur() {
  geneDropdownOpen.value = false
  geneSearch.value = coverageSelectedGene.value || ''
}
function selectCoverageGene(g) {
  coverageSelectedGene.value = g
  geneDropdownOpen.value = false
  geneSearch.value = g
}
function clearCoverageGene() {
  coverageSelectedGene.value = ''
  geneSearch.value = ''
  geneDropdownOpen.value = true
  nextTick(() => geneInputRef.value?.focus())
}

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

// Regions for gene mode: flat list of {chrom, start, end, gene, avgDepth, regionLength, fractionCovered}
const allGeneRegions = computed(() => getGeneData(coverageSelectedGene.value))

// BED regions filtered by selected gene (name column)
const activeBedRegions = computed(() => {
  if (!selectedBedGene.value) return bedRegions.value
  return bedRegions.value.filter(r => r.name === selectedBedGene.value)
})

// Regions for BED mode
const allBedRegions = computed(() =>
  bedMode.value ? getRegionData(activeBedRegions.value) : []
)

// Unified source — switches between gene and BED mode
const allRegions = computed(() => bedMode.value ? allBedRegions.value : allGeneRegions.value)

// Chromosomes available in the current view
const availableChroms = computed(() =>
  [...new Set(allRegions.value.map(r => r.chrom))].sort((a, b) =>
    String(a).localeCompare(String(b), undefined, { numeric: true })
  )
)

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
  allRegions.value
    .filter(r => r.chrom === selectedChrom.value)
    .sort((a, b) => a.start - b.start)
)

function applyZoom() {
  if (!chartRef.value) return
  const regs = regions.value
  const targets = props.jumpTo || []
  const indexSet = new Set()

  // Gene-name match for highlighted gene
  regs.forEach((r, i) => {
    if (highlightGene.value && r.gene === highlightGene.value) indexSet.add(i)
  })

  // Position overlap for all targets
  targets.forEach(t => {
    if (t.start && t.end) {
      regs.forEach((r, i) => {
        if (r.start <= t.end && r.end >= t.start) indexSet.add(i)
      })
    }
  })

  if (!indexSet.size) return
  const sorted = [...indexSet].sort((a, b) => a - b)
  const pad   = 3
  const total = regs.length
  const s = Math.max(0, sorted[0] - pad)
  const e = Math.min(total - 1, sorted[sorted.length - 1] + pad)
  chartRef.value.dispatchAction({
    type: 'dataZoom',
    start: (s / total) * 100,
    end:   (e / total) * 100,
  })
}

// Resolve the correct chrom from coverage data, normalising 'chr' prefix differences
function resolveChrom(targetChrom, gene) {
  const norm = c => String(c).replace(/^chr/i, '')
  // Match by chrom value (strip prefix on both sides)
  const byChrom = availableChroms.value.find(c => norm(c) === norm(targetChrom))
  if (byChrom) return byChrom
  // Fall back to finding any region with the given gene name
  return allRegions.value.find(r => r.gene === gene)?.chrom ?? ''
}

async function applyJump(targets) {
  if (!targets || !targets.length) { highlightGene.value = ''; return }
  coverageSelectedGene.value = ''
  // Navigate to most recently selected target (last in array)
  const last = targets[targets.length - 1]
  highlightGene.value = last.gene || ''
  await nextTick()
  const geneChrom = resolveChrom(last.chrom, highlightGene.value)
  if (geneChrom) selectedChrom.value = geneChrom
  await nextTick()
  applyZoom()
}

watch(() => props.jumpTo, applyJump, { immediate: true })

// Re-run whenever coverage data switches to a new sample (loaded stays true→true on change,
// so watching currentSample is the reliable trigger for both initial load and sample switches)
watch(currentSample, (sid) => { if (sid && props.jumpTo) applyJump(props.jumpTo) })

function depthColor(d) {
  if (d <= 20)  return '#ef4444'
  if (d <= 100) return '#f59e0b'
  return '#6b7280'
}

const stats = computed(() => {
  if (!regions.value.length) return null
  let weightedSum = 0, totalLen = 0, min = Infinity, max = -Infinity, ge20 = 0, ge100 = 0
  for (const r of regions.value) {
    const len = r.regionLength || (r.end - r.start)
    weightedSum += r.avgDepth * len
    totalLen    += len
    if (r.avgDepth < min) min = r.avgDepth
    if (r.avgDepth > max) max = r.avgDepth
    if (r.avgDepth >= 20)  ge20++
    if (r.avgDepth >= 100) ge100++
  }
  const n = regions.value.length
  return {
    mean:   totalLen > 0 ? (weightedSum / totalLen).toFixed(0) : 0,
    min:    min.toFixed(0),
    max:    max.toFixed(0),
    pct20:  (ge20  / n * 100).toFixed(1),
    pct100: (ge100 / n * 100).toFixed(1),
    count:  n,
  }
})

const option = computed(() => {
  const regs = regions.value
  if (!regs.length) return {}

  const xLabels = regs.map(r =>
    r.start >= 1e6
      ? `${(r.start / 1e6).toFixed(3)}M`
      : r.start.toLocaleString()
  )

  const hGene = highlightGene.value
  const targets = props.jumpTo || []

  function typeColor(type) {
    return type === 'DEL' ? '#ef4444' : type === 'DUP' ? '#3b82f6' : '#6b7280'
  }

  const lineData = regs.map(r => ({
    value: r.avgDepth,
    itemStyle: { color: depthColor(r.avgDepth) },
    _region: r,
  }))

  // Bar highlight: gene-name match OR overlap with any selected target
  const barData = !bedMode.value
    ? regs.map(r => {
        const byName = hGene && r.gene === hGene
        const byPos  = !byName && targets.some(t => t.start && t.end && r.start <= t.end && r.end >= t.start)
        if (!byName && !byPos) return null
        return { value: r.avgDepth, itemStyle: { color: depthColor(r.avgDepth), opacity: 0.75 }, _region: r }
      })
    : []

  // Build one annotation entry per target that overlaps regions on the current chrom
  const annotations = targets.map(t => {
    if (!t.start || !t.end) return null
    const indices = regs.reduce((acc, r, i) => {
      if (r.start <= t.end && r.end >= t.start) acc.push(i)
      return acc
    }, [])
    if (!indices.length) return null
    return { startIdx: indices[0], endIdx: indices[indices.length - 1], type: t.type }
  }).filter(Boolean)

  return {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'line' },
      backgroundColor: '#ffffff',
      borderColor: '#e5e7eb',
      textStyle: { color: '#1f2937', fontSize: 12 },
      formatter(params) {
        const p = params.find(p => p.data?._region) || params[0]
        const r = p.data._region
        const label = bedMode.value ? (r.bedName || r.gene || '') : (r.gene || '')
        const chromStr = r.chrom ? `chr${r.chrom}: ` : ''
        const pos = `${r.start.toLocaleString()}–${r.end.toLocaleString()}`
        return `${chromStr}${pos}<br/>${label ? `<b>${label}</b><br/>` : ''}Avg depth: <b>${r.avgDepth.toFixed(1)}×</b>`
      }
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
    grid: { top: 36, left: 64, right: 16, bottom: 58 },
    xAxis: {
      type: 'category',
      data: xLabels,
      axisLabel: { color: '#9ca3af', fontSize: 10, rotate: 45 },
      axisTick:  { show: true, lineStyle: { color: '#e5e7eb' } },
      axisLine:  { show: false },
      name: selectedChrom.value ? `chr${selectedChrom.value}` : '',
      nameLocation: 'middle',
      nameGap: 52,
      nameTextStyle: { color: '#6b7280', fontSize: 11, fontWeight: 'bold' }
    },
    yAxis: {
      type: 'value',
      name: 'Avg Depth (×)',
      nameLocation: 'middle',
      nameGap: 44,
      nameTextStyle: { color: '#6b7280', fontSize: 11, fontWeight: 'bold' },
      axisLabel: { color: '#9ca3af', fontSize: 10 },
      splitLine: { lineStyle: { color: '#f3f4f6' } },
      min: 0,
      max: (() => {
        const sorted = regs.map(r => r.avgDepth).sort((a, b) => a - b)
        const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? sorted[sorted.length - 1] ?? 120
        return Math.max(120, Math.ceil(p95 * 1.2 / 10) * 10)
      })(),
    },
    series: [
    // Variant annotation track — one entry per selected variant on this chrom
    {
      type: 'custom',
      z: 20,
      silent: true,
      data: annotations.map(a => [a.startIdx, a.endIdx]),
      renderItem(params, api) {
        const ann = annotations[params.dataIndex]
        if (!ann) return null
        const color = typeColor(ann.type)
        const startIdx = api.value(0)
        const endIdx   = api.value(1)
        const [x1] = api.coord([startIdx, 0])
        const [x2] = api.coord([endIdx,   0])
        const halfBar = api.size([1, 0])[0] / 2
        const left    = x1 - halfBar
        const right   = x2 + halfBar
        const top     = params.coordSys.y
        const h       = 12
        const midX    = (left + right) / 2
        return {
          type: 'group',
          children: [
            // Full-height background column
            {
              type: 'rect',
              shape: { x: left, y: top + h, width: right - left, height: params.coordSys.height - h },
              style: { fill: color, opacity: 0.07 },
            },
            // Annotation pill
            {
              type: 'rect',
              shape: { x: left, y: top, width: right - left, height: h, r: [3, 3, 0, 0] },
              style: { fill: color, opacity: 0.85 },
            },
            {
              type: 'text',
              style: {
                x: midX, y: top + h / 2,
                text: ann.type ?? 'Variant',
                fill: '#fff', fontSize: 9, fontWeight: 'bold',
                textAlign: 'center', textVerticalAlign: 'middle',
              },
            },
          ],
        }
      },
    },
    {
      type: 'bar',
      data: barData,
      barMaxWidth: 24,
      z: 3,
      itemStyle: { borderRadius: [3, 3, 0, 0] },
      label: { show: false },
    },
    {
      type: 'line',
      data: lineData,
      symbol: 'circle',
      symbolSize: 6,
      lineStyle: { color: '#21a8c2', width: 1.5 },
      areaStyle: { color: 'rgba(33,168,194,0.08)' },
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

        <!-- Coverage gene selector (searchable combobox, gene mode only) -->
        <div v-if="!bedMode && coverageGeneList.length" class="relative">
          <div class="flex items-center bg-white border border-gray-200 rounded-lg px-3 py-1.5 focus-within:border-teal-400 transition-colors min-w-[130px]">
            <input
              ref="geneInputRef"
              type="text"
              v-model="geneSearch"
              @focus="onGeneInputFocus"
              @input="onGeneInput"
              @blur="onGeneBlur"
              placeholder="All genes"
              class="flex-1 text-sm outline-none bg-transparent min-w-0 text-gray-700"
            />
            <button
              v-if="coverageSelectedGene"
              @mousedown.prevent
              @click="clearCoverageGene"
              class="ml-1 text-gray-300 hover:text-gray-500 text-xs flex-shrink-0 leading-none"
            >✕</button>
          </div>
          <div
            v-if="geneDropdownOpen"
            class="absolute z-50 left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto min-w-full"
          >
            <div
              @mousedown.prevent
              @click="selectCoverageGene('')"
              :class="['px-3 py-1.5 text-sm cursor-pointer text-gray-400 hover:bg-gray-50', coverageSelectedGene === '' ? 'bg-gray-50' : '']"
            >All genes</div>
            <div
              v-for="g in filteredCoverageGeneList"
              :key="g"
              @mousedown.prevent
              @click="selectCoverageGene(g)"
              :class="['px-3 py-1.5 text-sm cursor-pointer hover:bg-teal-50 hover:text-teal-700', g === coverageSelectedGene ? 'bg-teal-50 text-teal-700 font-medium' : 'text-gray-700']"
            >{{ g }}</div>
            <div v-if="!filteredCoverageGeneList.length" class="px-3 py-1.5 text-sm text-gray-300">No results</div>
          </div>
        </div>

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
            <span class="font-semibold text-gray-700">{{ stats.count }}</span> regions
          </span>
          <span class="text-xs text-gray-500">
            avg <span class="font-semibold text-gray-700">{{ stats.mean }}×</span>
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
        ref="chartRef"
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
