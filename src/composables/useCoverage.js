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

// Bumped whenever ensureAllCoverageParsed() finishes parsing new samples — lets callers
// (e.g. the data table's transcript-ID column) react to background parsing completing.
export const parsedVersion = ref(0)

/** Parses every loaded sample's coverage file that hasn't been parsed yet (skipping ones
 *  already cached). Used by the data table to look up overlapping transcript IDs across the
 *  whole cohort, not just whichever single sample is currently shown in the coverage chart. */
export async function ensureAllCoverageParsed() {
  let changed = false
  for (const [sampleId, file] of Object.entries(coverageFilesMap.value)) {
    if (parsedCache[sampleId]) continue
    try {
      const text = await file.text()
      parsedCache[sampleId] = parseCompact(text)
      changed = true
    } catch {
      // Leave unparsed — transcript lookups for this sample will just return none.
    }
  }
  if (changed) parsedVersion.value++
}

/** Distinct transcript IDs (sorted) from `sampleId`'s coverage regions that overlap
 *  [start, end] on the given chromosome. [] if that sample has no parsed coverage data. */
export function getTranscriptsForRegion(sampleId, chrom, start, end) {
  const data = parsedCache[sampleId]
  if (!data) return []
  const norm = c => String(c).replace(/^chr/i, '')
  const chromNorm = norm(chrom)
  const found = new Set()
  for (const regions of Object.values(data)) {
    for (const r of regions) {
      if (r.transcript && norm(r.chrom) === chromNorm && r.start <= end && r.end >= start) found.add(r.transcript)
    }
  }
  return [...found].sort()
}

// "NA" is this file's placeholder for a missing value — treat it as empty everywhere.
const cleanNA = (v) => (v === 'NA' ? '' : v)

// "AURKAIP1[ENST00000338338]:exon4" → { transcript: 'ENST00000338338', exon: 'exon4' }
// The ":exonN" suffix is optional — "AURKAIP1[ENST00000338338]" alone (no exon) means the
// position falls inside that transcript but not in a named exon, i.e. it's intronic.
function parseExonInfo(raw) {
  const m = /^.*?\[(.*?)\](?::(.*))?$/.exec(raw || '')
  return m ? { transcript: m[1], exon: m[2] || '' } : { transcript: '', exon: '' }
}

// ── TSV → compact format parser (runs in browser at runtime) ───────────────────
// 13 columns, no header (older files have 9 — no strand/gene_type/gene_name/exon info —
// or 8, predating stdev_coverage too)
// chrom  start  end  gene  avg_coverage  stdev_coverage  region_length  bases_covered
// fraction_covered  strand  gene_type  gene_name  transcript_exon (e.g. "GENE[ENST...]:exon4")
function parseCompact(text) {
  const geneMap = {}
  const lines   = text.split('\n')

  for (const line of lines) {
    if (!line) continue
    const cols = line.split('\t')
    if (cols.length < 8) continue

    const hasStdev = cols.length >= 9
    const hasExtra = cols.length >= 13

    const chrom        = cols[0]
    const start        = parseInt(cols[1])
    const end           = parseInt(cols[2])
    const gene          = cols[3]
    const avgDepth      = parseFloat(cols[4]) || 0
    const stdevDepth    = hasStdev ? (parseFloat(cols[5]) || 0) : null
    const regionLength  = parseInt(cols[hasStdev ? 6 : 5])
    const fractionCovered = parseFloat(cols[hasStdev ? 8 : 7])

    const strand   = hasExtra ? cleanNA(cols[9])  : ''
    const geneType = hasExtra ? cleanNA(cols[10]) : ''
    const geneName = hasExtra ? cleanNA(cols[11]) : ''
    let { transcript, exon } = hasExtra ? parseExonInfo(cols[12]) : { transcript: '', exon: '' }
    // A protein-coding hit with a transcript but no exon number means the position falls
    // between exons of that transcript, i.e. it's intronic — call it out explicitly.
    if (geneType === 'protein_coding' && transcript && !exon) exon = 'Intronic'

    if (!geneMap[gene]) geneMap[gene] = []
    geneMap[gene].push({
      chrom, start, end, gene, avgDepth, stdevDepth, regionLength, fractionCovered,
      strand, geneType, geneName, transcript, exon,
    })
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
      error.value = '' // clear any stale error left over from a previous, coverage-less sample
      return
    }
    const file = coverageFilesMap.value[sampleId]
    if (!file) {
      // Still record which sample is "current" (with no cache entry) so `loaded` and
      // `coverageGeneList` correctly go empty, instead of silently keeping the
      // previous sample's chart on screen mislabeled as this one.
      currentSample.value = sampleId
      error.value = 'No coverage file found for this sample.'
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
