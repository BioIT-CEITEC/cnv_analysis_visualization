import { ref, computed } from 'vue'

// Correct chromosome sort order (not alphabetical)
export const CHROM_ORDER = [
  '1','2','3','4','5','6','7','8','9','10',
  '11','12','13','14','15','16','17','18','19','20','21','22','X','Y'
]

/**
 * Manages all filter state. All charts receive the same `filtered` computed ref
 * so every filter change propagates to every chart simultaneously.
 *
 * @param {Ref<Array>} data - the full parsed rows from useData
 */
// Module-level so App.vue can set a default after loading sample data
export const selectedSample = ref('all')

export function useFilters(data) {
  const selectedChrom          = ref('all')
  const selectedType           = ref('all')   // 'all' | 'DEL' | 'DUP'
  const geneSearch             = ref('')
  const selectedCaller         = ref('all')
  const selectedClassification = ref('all')

  // Samples present in the data
  const availableSamples = computed(() =>
    [...new Set(data.value.map(r => r.sample))].filter(Boolean).sort()
  )

  // Genes present in the data
  const availableGenes = computed(() =>
    [...new Set(data.value.map(r => r.gene))].filter(Boolean).sort()
  )

  // Chromosomes present in the data, in correct genomic order
  const availableChromosomes = computed(() => {
    const inData = new Set(data.value.map(r => r.CHROM))
    return CHROM_ORDER.filter(c => inData.has(c))
  })

  // Unique classifications present in the data
  const availableClassifications = computed(() =>
    [...new Set(data.value.map(r => r.Classification).filter(Boolean))].sort()
  )

  // Unique callers present across all rows (derived from the 'callers' field)
  const availableCallers = computed(() => {
    const set = new Set()
    for (const row of data.value) {
      if (row.callers) {
        for (const c of row.callers.split(';')) {
          const trimmed = c.trim()
          if (trimmed) set.add(trimmed)
        }
      }
    }
    return [...set].sort()
  })

  const filtered = computed(() =>
    data.value.filter(row => {
      if (selectedSample.value !== 'all' && row.sample !== selectedSample.value) return false
      if (selectedChrom.value  !== 'all' && row.CHROM  !== selectedChrom.value)  return false
      if (selectedType.value   !== 'all' && row.consensus_type !== selectedType.value) return false
      if (geneSearch.value && row.gene !== geneSearch.value) return false
      if (selectedCaller.value !== 'all') {
        const callers = row.callers ? row.callers.split(';').map(c => c.trim()) : []
        if (!callers.includes(selectedCaller.value)) return false
      }
      if (selectedClassification.value !== 'all' && row.Classification !== selectedClassification.value) return false
      return true
    })
  )

  function reset() {
    selectedSample.value = 'all'
    selectedChrom.value  = 'all'
    selectedType.value   = 'all'
    geneSearch.value             = ''
    selectedCaller.value         = 'all'
    selectedClassification.value = 'all'
  }

  return {
    selectedSample, selectedChrom, selectedType, geneSearch, selectedCaller,
    selectedClassification, availableSamples, availableChromosomes, availableGenes,
    availableCallers, availableClassifications, filtered, reset
  }
}
