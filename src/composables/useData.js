import { ref } from 'vue'
import Papa from 'papaparse'

export function useData() {
  const rows     = ref([])
  const filename = ref('')
  const loading  = ref(false)
  const error    = ref('')

  async function load(file) {
    if (!file) return
    loading.value  = true
    error.value    = ''
    filename.value = file.name
    try {
      const text = await file.text()
      Papa.parse(text, {
        header: true,
        delimiter: '\t',
        skipEmptyLines: true,
        complete(results) {
          rows.value = results.data.map(r => {
            const START = parseInt(r.START)
            const END   = parseInt(r.END)
            return {
              ...r,
              gene:           r.genes           || r.GFT_genes      || '',
              consensus_type: r.type            || r.consensus_type || '',
              Classification: r.classifications || r.Classification || '',
              START,
              END,
              n_callers:   parseInt(r.n_callers) || 0,
              n_targets:   parseInt(r.n_targets) || 0,
              // SVLEN was dropped from the new format — fall back to END - START
              SVLEN:       r.SVLEN !== undefined ? (parseInt(r.SVLEN) || 0) : (END - START),
              total_score: parseFloat(r.max_total_score ?? r['Total score']) || 0,
            }
          })
          loading.value = false
        },
        error(err) {
          error.value   = `Parse error: ${err.message}`
          loading.value = false
        }
      })
    } catch (e) {
      error.value   = `Error reading file: ${e.message}`
      loading.value = false
    }
  }

  return { rows, filename, loading, error, load }
}
