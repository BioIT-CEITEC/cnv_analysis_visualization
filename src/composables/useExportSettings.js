import { ref } from 'vue'

// Shared, module-level so every plot's download button uses the same settings,
// set from the "Export Settings" sidebar section.
export const exportFormat = ref('png') // 'png' | 'jpeg'
export const exportDPI    = ref(150)   // 72 | 96 | 150 | 300

// ECharts' getDataURL() takes a pixelRatio (a multiplier on the on-screen CSS size),
// not a DPI value directly. 96 DPI is the standard reference density for one CSS
// pixel, so we convert the chosen DPI down to the pixelRatio ECharts expects.
export const BASE_DPI = 96
export function dpiToPixelRatio(dpi) {
  return dpi / BASE_DPI
}
