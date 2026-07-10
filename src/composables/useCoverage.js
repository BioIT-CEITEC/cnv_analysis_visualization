import { ref, computed } from 'vue'

// ── Module-level state (shared across all useCoverage() calls) ─────────────────
const coverageFilesMap = ref({})  // { sampleId: File }
const parsedCache      = {}       // { sampleId: { gene: [[chrom,start,end,depths[]], ...] } }
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
function parseCompact(text) {
  const geneMap = {}
  const lines   = text.split('\n')

  for (const line of lines) {
    if (!line) continue
    const tab1 = line.indexOf('\t')
    const tab2 = line.indexOf('\t', tab1 + 1)
    const tab3 = line.indexOf('\t', tab2 + 1)
    const tab4 = line.indexOf('\t', tab3 + 1)
    const tab5 = line.indexOf('\t', tab4 + 1)
    if (tab5 === -1) continue

    const chrom = line.slice(0, tab1)
    const start = parseInt(line.slice(tab1 + 1, tab2))
    const end   = parseInt(line.slice(tab2 + 1, tab3))
    const gene  = line.slice(tab3 + 1, tab4)
    const pos   = parseInt(line.slice(tab4 + 1, tab5))  // 1-based
    const depth = parseInt(line.slice(tab5 + 1))

    if (!geneMap[gene]) geneMap[gene] = {}
    const key = `${chrom}:${start}-${end}`
    if (!geneMap[gene][key]) geneMap[gene][key] = [chrom, start, end, []]
    geneMap[gene][key][3][pos - 1] = depth
  }

  const sorted = {}
  for (const gene of Object.keys(geneMap)) {
    sorted[gene] = Object.values(geneMap[gene])
      .sort((a, b) =>
        String(a[0]).localeCompare(String(b[0]), undefined, { numeric: true }) || a[1] - b[1]
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

  function getGeneData(gene) {
    const data = parsedCache[currentSample.value]
    if (!data) return []
    const genes = gene ? [gene] : Object.keys(data).sort()
    const rows = []
    for (const g of genes) {
      if (!data[g]) continue
      for (const [chrom, start, end, depths] of data[g]) {
        for (let i = 0; i < depths.length; i++) {
          if (depths[i] != null) {
            rows.push({ chrom, start, end, gene: g, pos: i + 1, depth: depths[i] })
          }
        }
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

  /**
   * Given an array of {chrom, start, end, name} BED regions, returns coverage
   * bases from the current sample that fall within each region.
   * Output: [{chrom, start, end, name, bases: [{pos, depth}]}]
   */
  function getRegionData(bedRegions) {
    const data = parsedCache[currentSample.value]
    if (!data) return []
    const norm = c => String(c).replace(/^chr/i, '')

    return bedRegions.map(({ chrom, start, end, name }) => {
      const nc = norm(chrom)
      const bases = []
      for (const regions of Object.values(data)) {
        for (const [rChrom, rStart, rEnd, depths] of Object.values(regions)) {
          if (norm(rChrom) !== nc) continue
          if (rEnd < start || rStart > end) continue
          for (let i = 0; i < depths.length; i++) {
            if (depths[i] == null) continue
            const pos = rStart + i
            if (pos >= start && pos <= end) bases.push({ pos, depth: depths[i] })
          }
        }
      }
      bases.sort((a, b) => a.pos - b.pos)
      return { chrom: nc, start, end, name: name || `${chrom}:${start}-${end}`, bases }
    })
  }

  return { coverageGeneList, getGeneData, getRegionData, loading, error, loaded, load, currentSample }
}
