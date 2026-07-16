<!--
  Caller Concordance — horizontal bar chart.
  Groups CNV calls by which combination of callers detected them.
  Uses the 'callers' semicolon-separated field from merged_target_consensus.tsv.
-->
<script setup>
import { computed } from 'vue'
import { VChart } from '../../utils/echarts.js'

const props = defineProps({ data: Array })

const LABEL_MAP = {
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

function callerLabel(raw) {
  return LABEL_MAP[raw.trim()] || raw.trim()
}

const option = computed(() => {
  const combos = {}

  for (const row of props.data) {
    const callers = row.callers
      ? row.callers.split(';').map(callerLabel)
      : []
    const key = callers.length ? callers.join(' + ') : 'None'
    combos[key] = (combos[key] || 0) + 1
  }

  const entries = Object.entries(combos).sort((a, b) => b[1] - a[1])

  const colorFor = key => {
    if (key === 'None') return '#d1d5db'
    const n = key.split(' + ').length
    if (n >= 5) return '#16a34a'
    if (n >= 3) return '#7c3aed'
    if (n >= 2) return '#3b82f6'
    return '#9ca3af'
  }

  return {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      backgroundColor: '#ffffff',
      borderColor: '#e5e7eb',
      textStyle: { color: '#1f2937', fontSize: 12 }
    },
    grid: { top: 12, left: 110, right: 48, bottom: 28 },
    xAxis: {
      type: 'value',
      axisLabel: { color: '#9ca3af', fontSize: 10 },
      splitLine: { lineStyle: { color: '#f3f4f6' } }
    },
    yAxis: {
      type: 'category',
      data: entries.map(e => e[0]),
      axisLabel: { color: '#6b7280', fontSize: 11 }
    },
    series: [{
      type: 'bar',
      data: entries.map(([key, count]) => ({
        value: count,
        itemStyle: { color: colorFor(key) }
      })),
      label: { show: true, position: 'right', color: '#9ca3af', fontSize: 11 }
    }]
  }
})
</script>

<template>
  <VChart :option="option" autoresize style="height: 300px" />
</template>
