import { ref } from 'vue'
import Papa from 'papaparse'

// "CFH, NA" → "CFH" — drop placeholder "NA" entries from comma-separated gene lists so
// they don't break exact gene-name matching against the coverage data (e.g. jump-to-gene).
function cleanGeneList(raw) {
  if (!raw) return ''
  return raw.split(',').map(g => g.trim()).filter(g => g && g.toUpperCase() !== 'NA').join(', ')
}

export function useData() {
  const rows    = ref([])
  const loading = ref(false)
  const error   = ref('')

  async function load(file) {
    if (!file) return
    loading.value = true
    error.value   = ''
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
              // BED_gene_name comes straight from the coverage/target-panel annotation, so it
              // always matches the coverage file's own gene labels exactly — use it whenever
              // present instead of the consensus caller's own (possibly differently-named) gene
              // annotation. Falls back to the old columns for files without BED_gene_name yet.
              gene:           cleanGeneList(r.BED_gene_name || r.genes || r.GFT_genes || ''),
              consensus_type: r.type            || r.consensus_type || '',
              Classification: r.classifications || r.Classification || '',
              dosage_sensitive_genes: r.dosage_sensitive_genes || r['Known or predicted dosage-sensitive genes'] || '',
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

  return { rows, loading, error, load }
}
