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
          rows.value = results.data.map(r => ({
            ...r,
            gene:        r.GFT_genes || '',
            START:       parseInt(r.START),
            END:         parseInt(r.END),
            n_callers:   parseInt(r.n_callers)          || 0,
            n_targets:   parseInt(r.n_targets)          || 0,
            SVLEN:       parseInt(r.SVLEN)               || 0,
            total_score: parseFloat(r['Total score'])    || 0,
          }))
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
