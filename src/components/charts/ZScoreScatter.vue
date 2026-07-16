<!--
  Genome-Wide Caller Support — scatter plot across all chromosomes.
  X axis = chromosomes (CNVs spread by genomic position within each chrom).
  Y axis = n_callers (number of callers supporting the call).
  DEL = red cross, DUP = blue cross.
  Gene labels on calls with high caller support (n_callers >= max-1).
-->
<script setup>
import { computed } from 'vue'
import { VChart } from '../../utils/echarts.js'

const props = defineProps({ data: Array, chromOrder: Array })
const emit  = defineEmits(['navigate'])

const option = computed(() => {
  const rows   = props.data
  if (!rows.length) return {}

  const chroms = props.chromOrder.filter(c => rows.some(r => r.CHROM === c))

  // Min/max START per chromosome for relative x positioning
  const extents = {}
  for (const c of chroms) {
    const positions = rows.filter(r => r.CHROM === c).map(r => r.START)
    extents[c] = { min: Math.min(...positions), max: Math.max(...positions) }
  }

  const maxCallers = rows.reduce((m, r) => Math.max(m, r.n_callers), 0)

  const del = [], dup = []

  for (const row of rows) {
    const ci   = chroms.indexOf(row.CHROM)
    const { min, max } = extents[row.CHROM]
    const frac = max > min ? (row.START - min) / (max - min) : 0.5
    const x    = ci + frac * 0.85 + 0.075
    const isDel = row.consensus_type === 'DEL'
    const yVal  = isDel ? -row.n_callers : row.n_callers

    const pt = {
      value: [x, yVal, row.gene, row.SVLEN, row.Classification || '', row.n_callers, row.CHROM],
      ...(row.gene ? {
        label: {
          show: true,
          formatter: row.gene,
          fontSize: 9,
          color: isDel ? '#ef4444' : '#3b82f6',
          position: isDel ? 'bottom' : 'top',
          distance: 4,
        }
      } : {})
    }

    if (isDel) del.push(pt)
    else dup.push(pt)
  }

  return {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'item',
      backgroundColor: '#ffffff',
      borderColor: '#e5e7eb',
      textStyle: { color: '#1f2937', fontSize: 12 },
      formatter: p => {
        const [, , gene, svlen, cls, nc] = p.data.value ?? p.data
        return `<b>${gene || '—'}</b><br/>Callers: ${nc}<br/>Size: ${svlen?.toLocaleString()} bp<br/>${cls}`
      }
    },
    legend: {
      data: ['DEL', 'DUP'],
      top: 4, right: 8,
      textStyle: { color: '#6b7280', fontSize: 11 }
    },
    grid: { top: 36, left: 52, right: 16, bottom: 32 },
    xAxis: {
      type: 'value',
      min: 0,
      max: chroms.length,
      interval: 1,
      axisLabel: {
        color: '#9ca3af',
        fontSize: 10,
        formatter: v => {
          const i = Math.round(v)
          return chroms[i] !== undefined ? chroms[i] : ''
        }
      },
      splitLine: { lineStyle: { color: '#f3f4f6', type: 'dashed' } }
    },
    yAxis: {
      type: 'value',
      name: 'Callers',
      nameLocation: 'middle',
      nameGap: 32,
      nameTextStyle: { color: '#6b7280', fontSize: 11, fontWeight: 'bold' },
      axisLabel: {
        color: '#9ca3af', fontSize: 10,
        formatter: v => Math.abs(v)
      },
      splitLine: { lineStyle: { color: '#f3f4f6' } },
      minInterval: 1,
      min: -maxCallers,
      max: maxCallers,
    },
    series: [
      {
        name: 'DEL',
        type: 'scatter',
        data: del,
        symbol: 'cross',
        symbolSize: 7,
        itemStyle: { color: '#ef4444', opacity: 0.75 },
        markLine: {
          silent: true, symbol: 'none',
          data: [{ yAxis: 0, lineStyle: { color: '#d1d5db', width: 1 } }],
          label: { show: false }
        }
      },
      {
        name: 'DUP',
        type: 'scatter',
        data: dup,
        symbol: 'cross',
        symbolSize: 7,
        itemStyle: { color: '#3b82f6', opacity: 0.75 }
      },
    ]
  }
})

function onPointClick(params) {
  const v = params.data?.value
  if (!v) return
  const [, , gene, , , , chrom] = v
  if (gene && chrom) emit('navigate', { gene, chrom })
}
</script>

<template>
  <VChart :option="option" autoresize style="width: 100%; height: 340px; cursor: pointer" @click="onPointClick" />
</template>
