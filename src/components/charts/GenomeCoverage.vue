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

// Regions aren't contiguous — there are real (often huge) gaps between them (introns,
// intergenic space). Rendering them as an evenly-spaced category axis falsely implies
// they're back-to-back. Instead, insert "spacer" slots between regions sized by
// log1p(gap) — big enough to read as a gap, compressed enough that one huge intergenic
// stretch doesn't squeeze every other region into invisibility. Capped so a
// chromosome-arm-scale gap doesn't blow up the axis.
const MAX_SPACERS = 20

// Gene + variant header rows, drawn above the plot area (in dedicated grid margin, not
// inside the data area) so they never depend on — or collide with — the y-axis headroom.
const GENE_ROW_H = 14
const VARIANT_ROW_H = 12
const HEADER_GAP = 3
const HEADER_MARGIN = HEADER_GAP + GENE_ROW_H + HEADER_GAP + VARIANT_ROW_H + HEADER_GAP
const layout = computed(() => {
  const regs = regions.value
  const slots = []
  const regIndexToSlot = []
  regs.forEach((r, i) => {
    if (i > 0) {
      const gap = r.start - regs[i - 1].end
      if (gap > 0) {
        const n = Math.min(MAX_SPACERS, Math.round(Math.log1p(gap)))
        for (let k = 0; k < n; k++) slots.push({ real: false })
      }
    }
    regIndexToSlot.push(slots.length)
    slots.push({ real: true, region: r })
  })
  return { slots, regIndexToSlot }
})

function applyZoom() {
  if (!chartRef.value) return
  const regs = regions.value
  const { regIndexToSlot, slots } = layout.value
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
  const pad     = 3
  const regTotal = regs.length
  const startRegIdx = Math.max(0, sorted[0] - pad)
  const endRegIdx   = Math.min(regTotal - 1, sorted[sorted.length - 1] + pad)
  const s = regIndexToSlot[startRegIdx]
  const e = regIndexToSlot[endRegIdx]
  setZoom((s / slots.length) * 100, (e / slots.length) * 100)
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

// Clicking a region (bar or line point) selects its gene and zooms into that gene's
// full set of target regions — the same behavior as picking it from the gene combobox.
function onChartClick(params) {
  const region = params?.data?._region
  if (!region) return // spacer slot, or a click on the whisker/annotation track — no region to zoom to
  selectCoverageGene(region.gene)
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

const hasStdev = computed(() => regions.value.some(r => r.stdevDepth != null))

// Length-weighted mean depth across the regions currently shown — the reference point
// the "Normalize to average" toggle re-centers the plot on.
const meanDepth = computed(() => {
  const regs = regions.value
  if (!regs.length) return 0
  let weightedSum = 0, totalLen = 0
  for (const r of regs) {
    const len = r.regionLength || (r.end - r.start)
    weightedSum += r.avgDepth * len
    totalLen    += len
  }
  return totalLen > 0 ? weightedSum / totalLen : 0
})

const stats = computed(() => {
  if (!regions.value.length) return null
  let min = Infinity, max = -Infinity, ge20 = 0, ge100 = 0
  for (const r of regions.value) {
    if (r.avgDepth < min) min = r.avgDepth
    if (r.avgDepth > max) max = r.avgDepth
    if (r.avgDepth >= 20)  ge20++
    if (r.avgDepth >= 100) ge100++
  }
  const n = regions.value.length
  return {
    mean:   meanDepth.value.toFixed(0),
    min:    min.toFixed(0),
    max:    max.toFixed(0),
    pct20:  (ge20  / n * 100).toFixed(1),
    pct100: (ge100 / n * 100).toFixed(1),
    count:  n,
  }
})

// "Normalize to average" — re-centers the plot so each region's expected depth (its own
// cohort average, when available) is 0, showing over/under deviations instead of absolute
// depth. This already IS "the average of the cohort", so the separate cohort-average
// overlay toggle is hidden while this is on — showing both would be redundant.
const normalizeToAvg = ref(false)
watch(normalizeToAvg, (on) => { if (on) loadCohortAverage() })

const option = computed(() => {
  const regs = regions.value
  if (!regs.length) return {}

  const { slots, regIndexToSlot } = layout.value

  // Full (non-abbreviated) start position — spacer slots get a blank label
  const xLabels = slots.map(s => s.real ? s.region.start.toLocaleString() : '')

  const hGene = highlightGene.value
  const targets = props.jumpTo || []

  // When normalized, every plotted value is shifted so each region's own expected depth sits
  // at 0. That expected depth is the region's cohort average (a fairer reference than one
  // flat number, since different regions have very different natural depths) — falling back
  // to this sample's own chromosome-wide mean for regions with no cohort data (yet).
  // Cohort-average is already what "normalize" centers on, so the separate cohort-average
  // overlay (below) is suppressed while normalized — showing it too would be redundant.
  const cohortReady = cohortAverageReady.value
  function baselineFor(r) {
    if (!normalizeToAvg.value) return { value: 0, source: 'none' }
    const cohortAvg = cohortReady ? getCohortAverage(r.chrom, r.start, r.end) : null
    return (cohortAvg !== null && cohortAvg !== undefined)
      ? { value: cohortAvg, source: 'cohort' }
      : { value: meanDepth.value, source: 'sample' }
  }

  function typeColor(type) {
    return type === 'DEL' ? '#ef4444' : type === 'DUP' ? '#3b82f6' : '#6b7280'
  }

  const lineData = slots.map(s => s.real
    ? { value: s.region.avgDepth - baselineFor(s.region).value, itemStyle: { color: depthColor(s.region.avgDepth) }, _region: s.region }
    : { value: null })

  // Cohort-average overlay: same region, averaged across every loaded sample — hidden while
  // normalized, since the 0/avg line already represents the cohort average at that point.
  const showCohort = !normalizeToAvg.value && showCohortAvg.value && cohortReady
  const cohortLineData = showCohort
    ? slots.map(s => {
        if (!s.real) return { value: null }
        const v = getCohortAverage(s.region.chrom, s.region.start, s.region.end)
        return { value: v, _region: s.region }
      })
    : []

  // Whiskers: avg depth ± 1 stdev, per region (only for regions that have a stdev value).
  // Clamp the raw low bound at 0 before applying the normalization shift.
  const errorBarData = regs.reduce((acc, r, i) => {
    if (r.stdevDepth != null) {
      const b  = baselineFor(r).value
      const lo = Math.max(0, r.avgDepth - r.stdevDepth)
      const hi = r.avgDepth + r.stdevDepth
      acc.push([regIndexToSlot[i], lo - b, hi - b])
    }
    return acc
  }, [])

  // Bars for every region: light gray by default, darker gray for the selected
  // gene, red/blue when the region overlaps a DEL/DUP variant. Spacer slots get no bar.
  // Rounded corner tracks the tip of the bar (away from the 0/avg line) — when normalized,
  // a below-average bar renders downward, so its "far" end is the bottom, not the top.
  const barData = slots.map(s => {
    if (!s.real) return { value: null }
    const r = s.region
    const value  = r.avgDepth - baselineFor(r).value
    const radius = value < 0 ? [0, 0, 3, 3] : [3, 3, 0, 0]
    const variant = targets.find(t => t.start && t.end && r.start <= t.end && r.end >= t.start)
    if (variant) return { value, itemStyle: { color: typeColor(variant.type), borderRadius: radius }, _region: r }

    const isSelected = hGene && geneMatches(r.gene, hGene)
    return { value, itemStyle: { color: isSelected ? '#6b7280' : '#e5e7eb', borderRadius: radius }, _region: r }
  })

  // Build one annotation entry per target that overlaps regions on the current chrom
  const annotations = targets.map(t => {
    if (!t.start || !t.end) return null
    const indices = regs.reduce((acc, r, i) => {
      if (r.start <= t.end && r.end >= t.start) acc.push(regIndexToSlot[i])
      return acc
    }, [])
    if (!indices.length) return null
    return { startIdx: indices[0], endIdx: indices[indices.length - 1], type: t.type }
  }).filter(Boolean)

  // Gene track — one label per contiguous run of regions sharing the same gene(s), grouped by
  // the BED file's own gene field (so runs always match what the coverage file itself calls
  // that region). The visible arrow label only shows the BED name(s); the GTF gene_name(s) and
  // every distinct strand seen across the run (regions within one BED-named run can disagree,
  // e.g. an overlapping antisense feature) are collected too, surfaced on hover instead.
  const bedGeneParts = (field) => (field || '').split(',').map(g => g.trim()).filter(Boolean)
  const geneRuns = []
  let currentRun = null
  regs.forEach((r, i) => {
    const parts = bedGeneParts(r.gene)
    const key = parts.slice().sort().join(',')
    if (!key) { currentRun = null; return }
    const gtfParts = bedGeneParts(r.geneName)
    if (currentRun && currentRun.key === key) {
      currentRun.endIdx = regIndexToSlot[i]
      if (r.strand) currentRun.strands.add(r.strand)
      gtfParts.forEach(g => currentRun.gtfGenes.add(g))
    } else {
      currentRun = {
        key, genes: parts, gtfGenes: new Set(gtfParts), strands: new Set(r.strand ? [r.strand] : []),
        startIdx: regIndexToSlot[i], endIdx: regIndexToSlot[i],
      }
      geneRuns.push(currentRun)
    }
  })

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
        const p = params.find(p => p.data?._region)
        if (!p) return '' // hovering a spacer slot (the gap between regions) — nothing to show
        const r = p.data._region
        const label = r.gene || ''
        const chromStr = r.chrom ? `chr${r.chrom}: ` : ''
        const pos = `${r.start.toLocaleString()}–${r.end.toLocaleString()}`
        // "Target region" = this exon/target region from the coverage file (what's actually
        // hovered). "Variant region" = the selected CNV's own start–end, which usually spans
        // several target regions, so it's shown separately rather than conflated with the above.
        let html = `Target region: <b>${chromStr}${pos}</b><br/>${label ? `Gene name: <b>${label}</b><br/>` : ''}`
        if (r.geneName && r.geneName !== label) html += `Annotated gene: <b>${r.geneName}</b><br/>`
        if (r.exon)       html += `Exon: <b>${r.exon}</b><br/>`
        if (r.transcript) html += `Transcript: <b>${r.transcript}</b><br/>`
        if (r.strand)     html += `Strand: <b>${r.strand}</b><br/>`
        if (r.geneType)   html += `Gene type: <b>${r.geneType}</b><br/>`
        html += `Avg depth: <b>${r.avgDepth.toFixed(1)}×</b>`
        if (r.stdevDepth != null) html += ` <span style="color:#9ca3af">(±${r.stdevDepth.toFixed(1)}×)</span>`
        if (normalizeToAvg.value) {
          const { value: b, source } = baselineFor(r)
          const delta = r.avgDepth - b
          const color = delta >= 0 ? '#16a34a' : '#dc2626'
          const vsLabel = source === 'cohort' ? 'cohort avg' : 'sample avg'
          html += `<br/><span style="color:${color}">${delta >= 0 ? '+' : ''}${delta.toFixed(1)}× vs ${vsLabel}</span>`
        }
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
    // Normalized mode can show wider tick labels (negative numbers, e.g. "-550") than the
    // plain positive-depth axis — a little extra left margin keeps them clear of the axis name.
    // Extra top margin reserves dedicated space for the gene + variant header rows above the
    // plot area, so they never depend on (and can't collide with) the y-axis headroom padding.
    grid: { top: 36 + HEADER_MARGIN, left: normalizeToAvg.value ? 74 : 64, right: 16, bottom: 58 },
    xAxis: {
      type: 'category',
      data: xLabels,
      // Spacer slots (the gaps between regions) carry no label — skip ticks/labels for them
      axisLabel: { color: '#9ca3af', fontSize: 10, rotate: 45, interval: (i) => slots[i]?.real },
      axisTick:  { show: true, lineStyle: { color: '#e5e7eb' }, interval: (i) => slots[i]?.real },
      axisLine:  { show: false },
      name: selectedChrom.value ? `chr${selectedChrom.value}` : '',
      nameLocation: 'middle',
      nameGap: 52,
      nameTextStyle: { color: '#6b7280', fontSize: 11, fontWeight: 'bold' }
    },
    yAxis: {
      type: 'value',
      name: normalizeToAvg.value ? 'Depth vs avg (×)' : 'Avg Depth (×)',
      nameLocation: 'middle',
      nameGap: 44,
      nameTextStyle: { color: '#6b7280', fontSize: 11, fontWeight: 'bold' },
      axisLabel: { color: '#9ca3af', fontSize: 10 },
      splitLine: { lineStyle: { color: '#f3f4f6' } },
      ...(() => {
        // True range of everything actually plotted (bars/line + cohort overlay + whiskers,
        // all already shifted per-region above), so nothing gets clipped — with a little
        // headroom. Normalized mode gets a symmetric range around 0 for an even over/under look.
        const values = regs.map(r => r.avgDepth - baselineFor(r).value)
        if (showCohort) {
          for (const r of cohortLineData) {
            if (r.value !== null && r.value !== undefined) values.push(r.value)
          }
        }
        for (const [, lo, hi] of errorBarData) { values.push(lo); values.push(hi) }

        if (normalizeToAvg.value) {
          const maxAbs = values.length ? Math.max(...values.map(v => Math.abs(v))) : 20
          const bound = Math.max(20, Math.ceil(maxAbs * 1.2 / 10) * 10)
          return { min: -bound, max: bound }
        }
        const maxVal = values.length ? Math.max(...values) : 160
        return { min: 0, max: Math.max(160, Math.ceil(maxVal * 1.2 / 10) * 10) }
      })(),
    },
    series: [
    // Gene track — one label per contiguous run of same-gene regions, rendered in the
    // dedicated header margin above the plot (not `clip`ped — it lives outside the coordSys
    // rect on purpose — so left/right are clamped to the grid's own horizontal bounds by hand,
    // the same protection `clip` gives the data series below).
    {
      type: 'custom',
      z: 21,
      tooltip: {
        trigger: 'item',
        backgroundColor: '#ffffff',
        borderColor: '#e5e7eb',
        textStyle: { color: '#1f2937', fontSize: 12 },
        formatter(params) {
          const run = geneRuns[params.dataIndex]
          if (!run) return ''
          const strandList = [...run.strands]
          const strandLabel = s => s === '+' ? '+ (forward)' : s === '-' ? '− (reverse)' : s
          let html = `BED gene: <b>${run.genes.join(', ')}</b>`
          if (run.gtfGenes.size) html += `<br/>GTF gene: <b>${[...run.gtfGenes].join(', ')}</b>`
          if (strandList.length === 1) html += `<br/>Strand: <b>${strandLabel(strandList[0])}</b>`
          else if (strandList.length > 1) html += `<br/>Strand: <b>mixed (${strandList.map(strandLabel).join(', ')})</b>`
          return html
        },
      },
      data: geneRuns.map(g => [g.startIdx, g.endIdx]),
      renderItem(params, api) {
        const run = geneRuns[params.dataIndex]
        if (!run) return null
        const startIdx = api.value(0)
        const endIdx   = api.value(1)
        const [x1] = api.coord([startIdx, 0])
        const [x2] = api.coord([endIdx,   0])
        const halfBar = api.size([1, 0])[0] / 2
        const left    = Math.max(x1 - halfBar, params.coordSys.x)
        const right   = Math.min(x2 + halfBar, params.coordSys.x + params.coordSys.width)
        const h       = GENE_ROW_H
        const top     = params.coordSys.y - HEADER_GAP - VARIANT_ROW_H - HEADER_GAP - h
        const midX    = (left + right) / 2

        // Label: BED gene name(s) only — the GTF name(s) and strand detail surface on hover.
        const text = run.genes.join(', ')

        // Shape: an arrow pointing in the direction of transcription instead of a plain box —
        // a flat rect when strand is unknown. When a run has mixed strands (rare — usually an
        // overlapping antisense feature on part of it), the shape just uses the first seen;
        // the tooltip is what actually calls out the mix.
        const shapeStrand = [...run.strands][0] || ''
        const arrowLen = Math.min(6, (right - left) / 3)
        let points
        if (shapeStrand === '+') {
          points = [[left, top], [right - arrowLen, top], [right, top + h / 2], [right - arrowLen, top + h], [left, top + h]]
        } else if (shapeStrand === '-') {
          points = [[right, top], [left + arrowLen, top], [left, top + h / 2], [left + arrowLen, top + h], [right, top + h]]
        } else {
          points = [[left, top], [right, top], [right, top + h], [left, top + h]]
        }

        return {
          type: 'group',
          children: [
            {
              type: 'polygon',
              shape: { points },
              style: { fill: '#eef2f7', stroke: '#cbd5e1', lineWidth: 1 },
            },
            {
              type: 'text',
              style: {
                x: midX, y: top + h / 2,
                text, width: right - left, overflow: 'truncate', ellipsis: '…',
                fill: '#475569', fontSize: 9, fontWeight: 'bold',
                textAlign: 'center', textVerticalAlign: 'middle',
              },
            },
          ],
        }
      },
    },
    // Variant annotation track — one entry per selected variant on this chrom. Also rendered
    // in the header margin (see gene track above), except for the full-height tint column,
    // which intentionally reaches down into the plot's own (clipped) data area.
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
        const left    = Math.max(x1 - halfBar, params.coordSys.x)
        const right   = Math.min(x2 + halfBar, params.coordSys.x + params.coordSys.width)
        const h       = VARIANT_ROW_H
        const top     = params.coordSys.y - HEADER_GAP - h
        const midX    = (left + right) / 2
        return {
          type: 'group',
          children: [
            // Full-height background column — starts at the true top of the plot area (not
            // the header row above it) and reaches down through the bars.
            {
              type: 'rect',
              shape: { x: left, y: params.coordSys.y, width: right - left, height: params.coordSys.height },
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
      barMaxWidth: 60,
      z: 3,
      clip: true,
      label: { show: false },
    },
    {
      type: 'line',
      data: lineData,
      z: 4,
      clip: true,
      symbol: 'circle',
      symbolSize: 6,
      lineStyle: { color: '#21a8c2', width: 1.5 },
      areaStyle: { color: 'rgba(33,168,194,0.08)' },
      markLine: {
        silent: true,
        symbol: 'none',
        data: normalizeToAvg.value
          // The 150× absolute threshold isn't meaningful once the axis is re-centered on the
          // mean — show the 0 (= average) baseline instead, which is the whole point of this mode.
          ? [{
              yAxis: 0,
              lineStyle: { color: '#9ca3af', type: 'dashed', width: 1.5 },
              label: { position: 'insideStartTop', formatter: 'avg', color: '#6b7280', fontSize: 10 }
            }]
          : [{
              yAxis: 150,
              lineStyle: { color: '#eab308', type: 'dashed', width: 1.5 },
              label: { position: 'insideStartTop', formatter: '150×', color: '#eab308', fontSize: 10 }
            }]
      }
    },
    // Cohort-average overlay — transparent red, only added when the toggle is on
    ...(showCohort ? [{
      type: 'line',
      data: cohortLineData,
      z: 6,
      clip: true,
      symbol: 'none',
      connectNulls: true,
      lineStyle: { color: 'rgba(239,68,68,0.55)', width: 2 },
    }] : []),
    // Whiskers — avg depth ± 1 stdev, drawn as a vertical line with top/bottom caps
    {
      name: 'Depth ±1 SD',
      type: 'custom',
      z: 5,
      silent: true,
      clip: true,
      data: errorBarData,
      renderItem(params, api) {
        const idx = api.value(0)
        const lo  = api.value(1)
        const hi  = api.value(2)
        const [x, yLo] = api.coord([idx, lo])
        const [, yHi]  = api.coord([idx, hi])
        const cap = 12
        const style = { stroke: '#374151', lineWidth: 1.5 }
        return {
          type: 'group',
          children: [
            { type: 'line', shape: { x1: x, y1: yLo, x2: x, y2: yHi }, style },
            { type: 'line', shape: { x1: x - cap, y1: yLo, x2: x + cap, y2: yLo }, style },
            { type: 'line', shape: { x1: x - cap, y1: yHi, x2: x + cap, y2: yHi }, style },
          ],
        }
      },
    },
    ]
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

        <!-- Cohort-average overlay toggle — hidden while normalized, since the plot is
             already centered on the cohort average at that point (showing both is redundant) -->
        <label v-if="!normalizeToAvg" class="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer select-none">
          <input type="checkbox" v-model="showCohortAvg" class="rounded border-gray-300 text-red-400 focus:ring-red-300 focus:ring-offset-0" />
          <span class="inline-block w-3 h-3 rounded-sm" style="background: rgba(239,68,68,0.55)"></span>
          Display cohort average
        </label>

        <!-- Normalize to average — re-centers the plot so each region's cohort average is 0,
             showing over/under deviations instead of an absolute value -->
        <button
          @click="normalizeToAvg = !normalizeToAvg"
          title="Re-center the plot on each region's cohort average, showing over/under deviations instead of absolute depth"
          :class="[
            'flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border transition-colors',
            normalizeToAvg
              ? 'bg-teal-50 border-teal-300 text-teal-700'
              : 'bg-white border-gray-200 text-gray-500 hover:border-teal-400 hover:text-teal-600',
          ]"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="w-3.5 h-3.5">
            <path d="M3 12h18M7 7l-4 5 4 5M17 7l4 5-4 5"/>
          </svg>
          Normalize to average
        </button>

        <!-- Everything else — pushed to the right, where the zoom controls used to be -->
        <div class="flex items-center gap-3 flex-wrap ml-auto">
          <span v-if="loading" class="text-xs text-gray-400 animate-pulse">Loading coverage data…</span>
          <span v-if="(showCohortAvg || normalizeToAvg) && cohortAverageLoading" class="text-xs text-gray-400 animate-pulse">Computing cohort average…</span>
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
              <span v-if="hasStdev" class="flex items-center gap-1"><span class="inline-block w-3 border-t-2 border-gray-600"></span>±1 SD</span>
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
        @click="onChartClick"
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
