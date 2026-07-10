<!--
  Z-Score Scatter — genome-wide CNV plot (mirrors jabCoNtool style).
  X axis = chromosomes (targets spread by genomic position within each chrom).
  Y axis = standard deviation distance (z-score) of mean caller CN vs. all targets.
  DEL = red cross, DUP = blue cross. Gene labels on |z| > 2 outliers.
-->
<script setup>
import { computed } from 'vue'
import { VChart } from '../../utils/echarts.js'

const props = defineProps({ data: Array, chromOrder: Array })

function getGene(name) {
  return name?.split(':')[0] || ''
}

// Per-target mean CN across whichever callers made a call
function meanCN(row) {
  const vals = [
    row.exomedepth_CN, row.cnmops_CN, row.panelcnmops_CN,
    row.cnvkit_CN, row.freec_CN
  ].filter(v => v > 0)
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 2
}

const enriched = computed(() => {
  if (!props.data.length) return []

  const withMean = props.data.map(r => ({ ...r, cn: meanCN(r) }))

  // Z-score across all targets
  const cns = withMean.map(r => r.cn)
  const mean = cns.reduce((a, b) => a + b, 0) / cns.length
  const std  = Math.sqrt(cns.reduce((a, b) => a + (b - mean) ** 2, 0) / cns.length) || 1

  return withMean.map(r => ({ ...r, z: (r.cn - mean) / std }))
})

const option = computed(() => {
  const rows   = enriched.value
  const chroms = props.chromOrder.filter(c => rows.some(r => r.CHROM === c))

  // Min/max START per chromosome for relative x positioning
  const extents = {}
  for (const c of chroms) {
    const positions = rows.filter(r => r.CHROM === c).map(r => r.START)
    extents[c] = { min: Math.min(...positions), max: Math.max(...positions) }
  }

  const del = [], dup = [], cn2 = []

  for (const row of rows) {
    const ci    = chroms.indexOf(row.CHROM)
    const { min, max } = extents[row.CHROM]
    const frac  = max > min ? (row.START - min) / (max - min) : 0.5
    const x     = ci + frac * 0.85 + 0.075
    const gene  = getGene(row.target_name)
    const isCN2 = Math.round(row.cn) === 2
    const isOutlier = Math.abs(row.z) > 2

    const typeColor = isCN2 ? '#9ca3af' : row.consensus_type === 'DEL' ? '#ef4444' : '#3b82f6'

    const pt = {
      value: [x, parseFloat(row.z.toFixed(3)), gene, parseFloat(row.cn.toFixed(2))],
      ...(isOutlier && gene ? {
        label: {
          show: true,
          formatter: gene,
          fontSize: 9,
          color: typeColor,
          position: row.z > 0 ? 'top' : 'bottom',
          distance: 4
        }
      } : {})
    }

    if (isCN2) cn2.push(pt)
    else if (row.consensus_type === 'DEL') del.push(pt)
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
        const [, z, gene, cn] = p.data.value ?? p.data
        return `<b>${gene || '—'}</b><br/>Z-score: ${z}<br/>Mean CN: ${cn}`
      }
    },
    legend: {
      data: ['DEL', 'DUP', 'CN=2'],
      top: 4, right: 8,
      textStyle: { color: '#6b7280', fontSize: 11 }
    },
    grid: { top: 36, left: 64, right: 16, bottom: 32 },
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
      name: 'Std Dev Distance',
      nameLocation: 'middle',
      nameGap: 48,
      nameTextStyle: { color: '#6b7280', fontSize: 11, fontWeight: 'bold' },
      axisLabel: { color: '#9ca3af', fontSize: 10 },
      splitLine: { lineStyle: { color: '#f3f4f6' } }
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
      {
        name: 'CN=2',
        type: 'scatter',
        data: cn2,
        symbol: 'cross',
        symbolSize: 7,
        itemStyle: { color: '#9ca3af', opacity: 0.6 }
      }
    ]
  }
})
</script>

<template>
  <VChart :option="option" autoresize style="width: 100%; height: 340px" />
</template>
