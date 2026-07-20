import { ref, computed } from 'vue'

// ── Module-level state (shared across all useCoverage() calls) ─────────────────
const coverageFilesMap = ref({})  // { sampleId: File }
const parsedCache      = {}       // { sampleId: { gene: [{chrom,start,end,gene,avgDepth,regionLength,fractionCovered}] } }
const currentSample    = ref('')
export const coverageSelectedGene = ref('')

// Cohort-wide average depth per region, computed lazily across every loaded sample.
// { 'chrom:start-end': avgDepthAcrossCohort } | null (not computed yet)
const cohortAverageMap     = ref(null)
const cohortAverageLoading = ref(false)
const cohortAverageError   = ref('')

/** Called from App.vue after the user selects a folder. */
export function setCoverageFiles(map) {
  coverageFilesMap.value = map
  Object.keys(parsedCache).forEach(k => delete parsedCache[k])
  currentSample.value = ''
  cohortAverageMap.value = null
  cohortAverageError.value = ''
}

export const coverageSampleList = computed(() =>
  Object.keys(coverageFilesMap.value).sort()
)

export const coverageGeneList = computed(() => {
  // Depend on currentSample so this updates reactively after load() completes.
  const data = parsedCache[currentSample.value]
  return data ? Object.keys(data).sort() : []
})

// ── TSV → compact format parser (runs in browser at runtime) ───────────────────
// 8 columns, no header
// chrom  start  end  gene  avg_coverage  region_length  bases_covered  fraction_covered
function parseCompact(text) {
  const geneMap = {}
  const lines   = text.split('\n')

  for (const line of lines) {
    if (!line) continue
    const cols = line.split('\t')
    if (cols.length < 8) continue

    const chrom        = cols[0]
    const start        = parseInt(cols[1])
    const end          = parseInt(cols[2])
    const gene         = cols[3]
    const avgDepth      = parseFloat(cols[4]) || 0
    const regionLength = parseInt(cols[5])
    const fractionCovered = parseFloat(cols[7])

    if (!geneMap[gene]) geneMap[gene] = []
    geneMap[gene].push({ chrom, start, end, gene, avgDepth, regionLength, fractionCovered })
  }

  // Sort each gene's regions by chrom then start
  const sorted = {}
  for (const [gene, regions] of Object.entries(geneMap)) {
    sorted[gene] = regions.sort((a, b) =>
      String(a.chrom).localeCompare(String(b.chrom), undefined, { numeric: true }) || a.start - b.start
    )
  }
  return sorted
}

// ── Composable ─────────────────────────────────────────────────────────────────
export function useCoverage() {
  const loading = ref(false)
  const error   = ref('')
  const loaded  = computed(() =>
    currentSample.value !== '' && !!parsedCache[currentSample.value]
  )

  /** Returns regions for the given gene (or all genes if gene='') */
  function getGeneData(gene) {
    const data = parsedCache[currentSample.value]
    if (!data) return []
    const genes = gene ? [gene] : Object.keys(data).sort()
    const rows = []
    for (const g of genes) {
      if (!data[g]) continue
      for (const reg of data[g]) {
        rows.push(reg)
      }
    }
    return rows
  }

  async function load(sampleId) {
    if (!sampleId) return
    // Cache hit — no re-parsing needed
    if (parsedCache[sampleId]) {
      currentSample.value = sampleId
      return
    }
    const file = coverageFilesMap.value[sampleId]
    if (!file) {
      error.value = `No coverage file found for sample: ${sampleId}`
      return
    }
    loading.value = true
    error.value   = ''
    try {
      const text = await file.text()
      parsedCache[sampleId] = parseCompact(text)
      currentSample.value   = sampleId
      coverageSelectedGene.value = Object.keys(parsedCache[sampleId]).sort()[0] || ''
    } catch (e) {
      error.value = `Failed to read coverage: ${e.message}`
    } finally {
      loading.value = false
    }
  }

  const cohortAverageReady = computed(() => !!cohortAverageMap.value)

  /** Computes, once per loaded dataset, the average depth per region across every sample. */
  async function loadCohortAverage() {
    if (cohortAverageMap.value || cohortAverageLoading.value) return
    const files = Object.values(coverageFilesMap.value)
    if (!files.length) return

    cohortAverageLoading.value = true
    cohortAverageError.value   = ''
    try {
      const sums = {} // 'chrom:start-end' → { sum, count }
      for (const file of files) {
        const text = await file.text()
        for (const line of text.split('\n')) {
          if (!line) continue
          const cols = line.split('\t')
          if (cols.length < 8) continue
          const avgDepth = parseFloat(cols[4]) || 0
          const key = `${cols[0]}:${cols[1]}-${cols[2]}`
          const bucket = sums[key] || (sums[key] = { sum: 0, count: 0 })
          bucket.sum   += avgDepth
          bucket.count += 1
        }
      }
      const result = {}
      for (const [key, { sum, count }] of Object.entries(sums)) {
        result[key] = count > 0 ? sum / count : 0
      }
      cohortAverageMap.value = result
    } catch (e) {
      cohortAverageError.value = `Failed to compute cohort average: ${e.message}`
    } finally {
      cohortAverageLoading.value = false
    }
  }

  /** Average depth for a region across the whole cohort, or null if not (yet) available. */
  function getCohortAverage(chrom, start, end) {
    if (!cohortAverageMap.value) return null
    const v = cohortAverageMap.value[`${chrom}:${start}-${end}`]
    return v === undefined ? null : v
  }

  return {
    coverageGeneList, getGeneData, loading, error, loaded, load, currentSample,
    loadCohortAverage, getCohortAverage, cohortAverageReady, cohortAverageLoading, cohortAverageError,
  }
}
