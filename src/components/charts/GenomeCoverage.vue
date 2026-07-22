<!--
  Genome Coverage — per-region average depth line/area chart.
  Shows average read depth per target region for the selected gene/sample.
  Reference line: 150x (yellow dashed).
-->
<script setup>
import { ref, computed, watch, nextTick } from 'vue'
import { VChart } from '../../utils/echarts.js'
import { useCoverage, coverageSelectedGene, coverageGeneList } from '../../composables/useCoverage.js'
import { canonicalGene } from '../../utils/geneAliases.js'

const props = defineProps({
  sampleList:     Array,
  activeSampleId: { type: String, default: '' },
  jumpTo:         { default: null }, // Array of { gene, chrom, start, end, type } | null
})

// Either side of a gene-name comparison can be a compound "GENE1, GENE2" (or
// "GENE1,GENE2") field — the consensus table when a region overlaps two genes (e.g.
// opposite strands), or the coverage file when its own per-region annotation lists
// more than one name (e.g. an old alias alongside the current one, like VPS13B/COH1).
// Split both sides into individual names, normalise known HGNC symbol renames (see
// geneAliases.js), and match if any name appears on both sides.
function geneParts(field) {
  return field.split(',').map(g => canonicalGene(g.trim())).filter(Boolean)
}
function geneMatches(regionGene, targetGeneField) {
  if (!regionGene || !targetGeneField) return false
  const regionParts = geneParts(regionGene)
  return geneParts(targetGeneField).some(g => regionParts.includes(g))
}

const {
  getGeneData, loading, error, loaded, load, currentSample,
  loadCohortAverage, getCohortAverage, cohortAverageReady, cohortAverageLoading, cohortAverageError,
} = useCoverage()

// Cohort-average overlay — off by default; computed lazily the first time it's enabled
const showCohortAvg = ref(false)
watch(showCohortAvg, (on) => { if (on) loadCohortAverage() })

const chartRef      = ref(null)
defineExpose({ chartRef })
const selectedChrom = ref('')
const highlightGene = ref('')

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
  if (!g) highlightGene.value = ''
  geneDropdownOpen.value = false
  geneSearch.value = g
}
function clearCoverageGene() {
  coverageSelectedGene.value = ''
  highlightGene.value = ''
  geneSearch.value = ''
  geneDropdownOpen.value = true
  nextTick(() => geneInputRef.value?.focus())
}

// Load coverage whenever the sidebar sample changes
watch(
  () => props.activeSampleId,
  async (sid) => {
    if (!sid || sid === 'all') return
    await load(sid)
  },
  { immediate: true }
)

// All regions for the current sample. Always the full set — the selected gene only
// drives highlighting + zoom (see the coverageSelectedGene watcher below), not which
// regions are shown, so surrounding target regions stay visible for context.
const allRegions = computed(() => getGeneData(''))

// Chromosomes available in the current view
const availableChroms = computed(() =>
  [...new Set(allRegions.value.map(r => r.chrom))].sort((a, b) =>
    String(a).localeCompare(String(b), undefined, { numeric: true })
  )
)

watch(availableChroms, (chroms) => {
  if (!chroms.includes(selectedChrom.value)) {
    selectedChrom.value = chroms[0] ?? ''
  }
  resetZoom()
})

// Picking a gene from the coverage combobox highlights it and centers the view on it —
// same behavior as jumping from the table — without hiding the surrounding target regions.
// Clearing the gene (selectCoverageGene('') / clearCoverageGene()) resets the highlight itself,
// so this only needs to handle the "a gene was picked" case.
watch(coverageSelectedGene, async (gene) => {
  if (!gene) return
  highlightGene.value = gene
  const geneChrom = allRegions.value.find(r => geneMatches(r.gene, gene))?.chrom
  if (geneChrom) selectedChrom.value = geneChrom
  await nextTick()
  applyZoom()
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
    if (highlightGene.value && geneMatches(r.gene, highlightGene.value)) indexSet.add(i)
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
  setZoom((s / total) * 100, (e / total) * 100)
}

// ── Zoom controls ────────────────────────────────────────────────────────────
const zoomRange = ref({ start: 0, end: 100 })

// Keep zoomRange in sync with mouse-wheel/slider/box interactions on the chart itself
function onDataZoom(params) {
  const info = params?.batch ? params.batch[0] : params
  if (info && typeof info.start === 'number') {
    zoomRange.value = { start: info.start, end: info.end }
  }
}

function setZoom(start, end) {
  start = Math.max(0, Math.min(100, start))
  end   = Math.max(0, Math.min(100, end))
  if (end - start < 1) { // guard against a degenerate/zero-width range
    const mid = (start + end) / 2
    start = Math.max(0, mid - 0.5)
    end   = Math.min(100, mid + 0.5)
  }
  zoomRange.value = { start, end }
  chartRef.value?.dispatchAction({ type: 'dataZoom', start, end })
}

function zoomIn() {
  const { start, end } = zoomRange.value
  const mid  = (start + end) / 2
  const span = Math.max((end - start) / 2, 1)
  setZoom(mid - span / 2, mid + span / 2)
}

function zoomOut() {
  const { start, end } = zoomRange.value
  const mid  = (start + end) / 2
  const span = Math.min((end - start) * 2, 100)
  setZoom(mid - span / 2, mid + span / 2)
}

function resetZoom() {
  setZoom(0, 100)
}

// Resolve the correct chrom from coverage data, normalising 'chr' prefix differences
function resolveChrom(targetChrom, gene) {
  const norm = c => String(c).replace(/^chr/i, '')
  // Match by chrom value (strip prefix on both sides)
  const byChrom = availableChroms.value.find(c => norm(c) === norm(targetChrom))
  if (byChrom) return byChrom
  // Fall back to finding any region with the given gene name
  return allRegions.value.find(r => geneMatches(r.gene, gene))?.chrom ?? ''
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

  // Cohort-average overlay: same region, averaged across every loaded sample
  const showCohort = showCohortAvg.value && cohortAverageReady.value
  const cohortLineData = showCohort
    ? regs.map(r => ({ value: getCohortAverage(r.chrom, r.start, r.end), _region: r }))
    : []

  // Bars for every region: light gray by default, darker gray for the selected
  // gene, red/blue when the region overlaps a DEL/DUP variant.
  const barData = regs.map(r => {
    const variant = targets.find(t => t.start && t.end && r.start <= t.end && r.end >= t.start)
    if (variant) return { value: r.avgDepth, itemStyle: { color: typeColor(variant.type) }, _region: r }

    const isSelected = hGene && geneMatches(r.gene, hGene)
    return { value: r.avgDepth, itemStyle: { color: isSelected ? '#6b7280' : '#e5e7eb' }, _region: r }
  })

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

  // Match a hovered coverage region back to a selected/navigated CNV target
  // (targets carry cn_labels/classification from the consensus table; coverage regions don't).
  function findTargetForRegion(r) {
    const norm = c => String(c).replace(/^chr/i, '')
    return targets.find(t => t.start && t.end && norm(t.chrom) === norm(r.chrom) && r.start <= t.end && r.end >= t.start)
  }

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
        const label = r.gene || ''
        const chromStr = r.chrom ? `chr${r.chrom}: ` : ''
        const pos = `${r.start.toLocaleString()}–${r.end.toLocaleString()}`
        // "Target region" = this exon/target region from the coverage file (what's actually
        // hovered). "Variant region" = the selected CNV's own start–end, which usually spans
        // several target regions, so it's shown separately rather than conflated with the above.
        let html = `Target region: <b>${chromStr}${pos}</b><br/>${label ? `Gene name: <b>${label}</b><br/>` : ''}Avg depth: <b>${r.avgDepth.toFixed(1)}×</b>`
        if (showCohort) {
          const cohortAvg = getCohortAverage(r.chrom, r.start, r.end)
          if (cohortAvg !== null) html += `<br/>Cohort avg: <b>${cohortAvg.toFixed(1)}×</b>`
        }
        const t = findTargetForRegion(r)
        if (t?.start && t?.end) html += `<br/>Variant region: <b>${chromStr}${t.start.toLocaleString()}–${t.end.toLocaleString()}</b>`
        if (t?.classification) html += `<br/>Classification: <b>${t.classification}</b>`
        if (t?.cnLabels)       html += `<br/>CN labels: <b>${t.cnLabels}</b>`
        if (t) html += `<br/>Dosage sensitive gene: <b>${t.dosageSensitive ? 'Yes' : 'No'}</b>`
        return html
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
        // True max of everything actually plotted (bars/line + cohort overlay when shown),
        // so no bar gets clipped at the top — with a little headroom above it.
        const values = regs.map(r => r.avgDepth)
        if (showCohort) {
          for (const r of cohortLineData) {
            if (r.value !== null && r.value !== undefined) values.push(r.value)
          }
        }
        const maxVal = values.length ? Math.max(...values) : 160
        return Math.max(160, Math.ceil(maxVal * 1.1 / 10) * 10)
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
      z: 4,
      symbol: 'circle',
      symbolSize: 6,
      lineStyle: { color: '#21a8c2', width: 1.5 },
      areaStyle: { color: 'rgba(33,168,194,0.08)' },
      markLine: {
        silent: true,
        symbol: 'none',
        data: [
          {
            yAxis: 150,
            lineStyle: { color: '#eab308', type: 'dashed', width: 1.5 },
            label: { position: 'insideStartTop', formatter: '150×', color: '#eab308', fontSize: 10 }
          }
        ]
      }
    },
    // Cohort-average overlay — transparent red, only added when the toggle is on
    ...(showCohort ? [{
      type: 'line',
      data: cohortLineData,
      z: 6,
      symbol: 'none',
      connectNulls: true,
      lineStyle: { color: 'rgba(239,68,68,0.55)', width: 2 },
    }] : [])]
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
        To view coverage data, please select a specific sample from the sidebar.
      </p>
    </div>

    <!-- Alert: sample selected, but no coverage file is available for it -->
    <div
      v-else-if="!loading && error && !loaded"
      class="h-[280px] flex flex-col items-center justify-center gap-3 text-center"
    >
      <svg class="w-10 h-10 text-gray-300" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24">
        <path d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"/>
      </svg>
      <p class="text-sm text-gray-500 max-w-xs">{{ error }}</p>
    </div>

    <div v-else style="min-width: 640px">
      <!-- Controls -->
      <div class="flex items-center gap-3 mb-4 flex-wrap">

        <!-- Coverage gene selector (searchable combobox) -->
        <div v-if="coverageGeneList.length" class="relative">
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

        <!-- Zoom controls — right after the chromosome selector -->
        <div v-if="regions.length" class="flex items-center gap-1">
          <button
            @click="zoomOut"
            title="Zoom out"
            class="w-7 h-7 flex items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:border-teal-400 hover:text-teal-600 bg-white transition-colors"
          >−</button>
          <button
            @click="zoomIn"
            title="Zoom in"
            class="w-7 h-7 flex items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:border-teal-400 hover:text-teal-600 bg-white transition-colors"
          >+</button>
          <button
            @click="resetZoom"
            title="Reset zoom"
            class="text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:border-teal-400 hover:text-teal-600 bg-white transition-colors"
          >Reset</button>
        </div>

        <!-- Cohort-average overlay toggle -->
        <label class="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer select-none">
          <input type="checkbox" v-model="showCohortAvg" class="rounded border-gray-300 text-red-400 focus:ring-red-300 focus:ring-offset-0" />
          <span class="inline-block w-3 h-3 rounded-sm" style="background: rgba(239,68,68,0.55)"></span>
          Display cohort average
        </label>

        <!-- Everything else — pushed to the right, where the zoom controls used to be -->
        <div class="flex items-center gap-3 flex-wrap ml-auto">
          <span v-if="loading" class="text-xs text-gray-400 animate-pulse">Loading coverage data…</span>
          <span v-if="showCohortAvg && cohortAverageLoading" class="text-xs text-gray-400 animate-pulse">Computing cohort average…</span>
          <span v-if="cohortAverageError" class="text-xs text-red-500">{{ cohortAverageError }}</span>

          <!-- Stats chips -->
          <template v-if="stats">
            <span class="text-xs text-gray-500">
              <span class="font-semibold text-gray-700">{{ stats.count }}</span> regions
            </span>
            <span class="text-xs text-gray-500">
              avg <span class="font-semibold text-gray-700">{{ stats.mean }}×</span>
            </span>
            <span class="flex items-center gap-3 text-xs">
              <span class="flex items-center gap-1"><span class="inline-block w-3 h-3 rounded-sm bg-[#e5e7eb]"></span>Other regions</span>
              <span class="flex items-center gap-1"><span class="inline-block w-3 h-3 rounded-sm bg-[#6b7280]"></span>Selected gene</span>
              <span class="flex items-center gap-1"><span class="inline-block w-3 h-3 rounded-sm bg-[#ef4444]"></span>DEL</span>
              <span class="flex items-center gap-1"><span class="inline-block w-3 h-3 rounded-sm bg-[#3b82f6]"></span>DUP</span>
            </span>
          </template>
        </div>
      </div>

      <!-- Chart -->
      <VChart
        v-if="loaded && regions.length"
        ref="chartRef"
        :option="option"
        autoresize
        style="width: 100%; height: 320px"
        @datazoom="onDataZoom"
      />

      <!-- Empty state -->
      <div
        v-else-if="!loading"
        class="h-[280px] flex items-center justify-center text-sm text-gray-400"
      >
        No coverage data
      </div>
    </div>

  </div>
</template>
