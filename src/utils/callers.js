// Friendly display names for the caller identifiers used in the 'callers' column.
export const CALLER_LABELS = {
  cnvkit:      'CNVkit',
  exomedepth:  'ED',
  cnmops:      'cnMOPS',
  panelcnmops: 'pCNMOPS',
  freec:       'FreeC',
  xhmm:        'XHMM',
  conifer:     'CoNIFER',
  jabcontool:  'JaCoNTool',
  gatk_gcnv:   'GATK-gCNV',
}

export function callerLabel(raw) {
  return CALLER_LABELS[raw.trim()] || raw.trim()
}

// "gatk_gcnv;panelcnmops" → "GATK-gCNV, pCNMOPS"
export function formatCallers(callersStr) {
  if (!callersStr) return ''
  return callersStr.split(';').map(callerLabel).join(', ')
}
