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
  // Samples present in the data
  const availableSamples = computed(() =>
    [...new Set(data.value.map(r => r.sample))].filter(Boolean).sort()
  )

  const filtered = computed(() =>
    data.value.filter(row => selectedSample.value === 'all' || row.sample === selectedSample.value)
  )

  return { selectedSample, availableSamples, filtered }
}
