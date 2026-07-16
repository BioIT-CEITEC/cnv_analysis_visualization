import { ref, computed } from 'vue'

// ── Module-level state (shared across all useCoverage() calls) ─────────────────
const coverageFilesMap = ref({})  // { sampleId: File }
const parsedCache      = {}       // { sampleId: { gene: [{chrom,start,end,gene,avgDepth,regionLength,fractionCovered}] } }
const currentSample    = ref('')
export const coverageSelectedGene = ref('')

/** Called from App.vue after the user selects a folder. */
export function setCoverageFiles(map) {
  coverageFilesMap.value = map
  Object.keys(parsedCache).forEach(k => delete parsedCache[k])
  currentSample.value = ''
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
// New format: 8 columns, no header
// chrom  start  end  gene  total_depth_sum  region_length  bases_covered  fraction_covered
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
    const totalDepth   = parseInt(cols[4])
    const regionLength = parseInt(cols[5])
    const fractionCovered = parseFloat(cols[7])
    const avgDepth     = regionLength > 0 ? totalDepth / regionLength : 0

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

  /**
   * Given an array of {chrom, start, end, name} BED regions, returns coverage
   * regions from the current sample that overlap each BED region.
   * Output: [{chrom, start, end, gene, avgDepth, regionLength, fractionCovered, bedName}]
   */
  function getRegionData(bedRegions) {
    const data = parsedCache[currentSample.value]
    if (!data) return []
    const norm = c => String(c).replace(/^chr/i, '')

    // Flatten all coverage regions
    const allRegions = []
    for (const regions of Object.values(data)) {
      for (const reg of regions) {
        allRegions.push(reg)
      }
    }

    const result = []
    const seen   = new Set()

    for (const bed of bedRegions) {
      const nc = norm(bed.chrom)
      for (const reg of allRegions) {
        if (norm(reg.chrom) !== nc) continue
        if (reg.end < bed.start || reg.start > bed.end) continue
        const key = `${reg.chrom}:${reg.start}-${reg.end}`
        if (seen.has(key)) continue
        seen.add(key)
        result.push({ ...reg, bedName: bed.name })
      }
    }

    return result.sort((a, b) =>
      String(a.chrom).localeCompare(String(b.chrom), undefined, { numeric: true }) || a.start - b.start
    )
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

  return { coverageGeneList, getGeneData, getRegionData, loading, error, loaded, load, currentSample }
}
