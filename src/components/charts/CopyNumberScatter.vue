<!--
  CNV Size Scatter — one dot per CNV call.
  X axis = SVLEN (size of the CNV in bp, log scale).
  Y axis = n_callers (number of callers supporting the call).
  DEL = red, DUP = blue. Tooltip shows gene, classification, size.
-->
<script setup>
import { computed } from 'vue'
import { VChart } from '../../utils/echarts.js'

const props = defineProps({ data: Array })

const option = computed(() => {
  const del = [], dup = []

  for (const r of props.data) {
    const pt = {
      value: [r.SVLEN, r.n_callers, r.gene, r.Classification || '', r.consensus_type],
    }
    if (r.consensus_type === 'DEL') del.push(pt)
    else dup.push(pt)
  }

  const tooltipFmt = p => {
    const [svlen, nc, gene, cls] = p.data.value
    return `<b>${gene || '—'}</b><br/>Size: ${svlen?.toLocaleString()} bp<br/>Callers: ${nc}<br/>${cls}`
  }

  return {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'item',
      backgroundColor: '#ffffff',
      borderColor: '#e5e7eb',
      textStyle: { color: '#1f2937', fontSize: 12 },
      formatter: tooltipFmt,
    },
    legend: {
      data: ['DEL', 'DUP'],
      top: 4, right: 8,
      textStyle: { color: '#6b7280', fontSize: 11 }
    },
    grid: { top: 36, left: 52, right: 16, bottom: 32 },
    xAxis: {
      type: 'log',
      name: 'Size (bp)',
      nameLocation: 'middle',
      nameGap: 28,
      nameTextStyle: { color: '#6b7280', fontSize: 11, fontWeight: 'bold' },
      axisLabel: {
        color: '#9ca3af', fontSize: 10,
        formatter: v => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v
      },
      splitLine: { lineStyle: { color: '#f3f4f6' } },
      min: 1,
    },
    yAxis: {
      type: 'value',
      name: 'Callers',
      nameLocation: 'middle',
      nameGap: 32,
      nameTextStyle: { color: '#6b7280', fontSize: 11, fontWeight: 'bold' },
      axisLabel: { color: '#9ca3af', fontSize: 10 },
      splitLine: { lineStyle: { color: '#f3f4f6' } },
      minInterval: 1,
      min: 0,
    },
    series: [
      {
        name: 'DEL',
        type: 'scatter',
        symbolSize: 7,
        itemStyle: { color: '#ef4444', opacity: 0.75 },
        data: del,
      },
      {
        name: 'DUP',
        type: 'scatter',
        symbolSize: 7,
        itemStyle: { color: '#3b82f6', opacity: 0.75 },
        data: dup,
      },
    ]
  }
})
</script>

<template>
  <VChart :option="option" autoresize style="height: 320px" />
</template>
