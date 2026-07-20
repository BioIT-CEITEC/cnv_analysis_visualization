import { exportFormat, exportDPI, dpiToPixelRatio } from '../composables/useExportSettings.js'

/** Downloads an ECharts instance (as exposed by vue-echarts' VChart ref) as an image. */
export function downloadChartImage(chart, filename) {
  if (!chart || typeof chart.getDataURL !== 'function') return
  const url = chart.getDataURL({
    type: exportFormat.value,
    pixelRatio: dpiToPixelRatio(exportDPI.value),
    backgroundColor: '#ffffff',
  })
  const a = document.createElement('a')
  a.href = url
  a.download = `${filename}.${exportFormat.value}`
  document.body.appendChild(a)
  a.click()
  a.remove()
}
