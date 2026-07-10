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
            gene:           r.target_name?.split(':')[0] || '',
            START:          parseInt(r.START),
            END:            parseInt(r.END),
            Count_Detected: parseInt(r.Count_Detected)  || 0,
            n_DEL:          parseInt(r.n_DEL)           || 0,
            n_DUP:          parseInt(r.n_DUP)           || 0,
            cnvkit_CN:      parseFloat(r.cnvkit_CN)      || 0,
            exomedepth_CN:  parseFloat(r.exomedepth_CN)  || 0,
            cnmops_CN:      parseFloat(r.cnmops_CN)      || 0,
            panelcnmops_CN: parseFloat(r.panelcnmops_CN) || 0,
            freec_CN:       parseFloat(r.freec_CN)       || 0,
            xhmm_CN:        parseFloat(r.xhmm_CN)        || 0,
            conifer_CN:     parseFloat(r.conifer_CN)     || 0,
            jabcontool_CN:  parseFloat(r.jabcontool_CN)  || 0,
            gatk_gcnv_CN:   parseFloat(r.gatk_gcnv_CN)  || 0,
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
