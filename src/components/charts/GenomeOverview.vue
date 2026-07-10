<!--
  Genome Overview — scatter plot showing every CNV target across all chromosomes.
  Y axis = chromosome lane, X axis = genomic position.
  Red dots = DEL, Blue dots = DUP. Hover for gene + caller info.
-->
<script setup>
import { computed } from 'vue'
import { VChart } from '../../utils/echarts.js'

const props = defineProps({ data: Array, chromOrder: Array })

function getGene(name) {
  return name?.split(':')[0] || 'Unknown'
}

const option = computed(() => {
  const chroms = props.chromOrder.filter(c => props.data.some(r => r.CHROM === c))

  const del = [], dup = []
  for (const row of props.data) {
    const y = chroms.indexOf(row.CHROM)
    const pt = [row.START, y, getGene(row.target_name), row.Count_Detected]
    row.consensus_type === 'DEL' ? del.push(pt) : dup.push(pt)
  }

  return {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'item',
      backgroundColor: '#ffffff',
      borderColor: '#e5e7eb',
      textStyle: { color: '#1f2937', fontSize: 12 },
      formatter: p => {
        const [pos, yi, gene, callers] = p.data
        return `<b>${gene}</b><br/>chr${chroms[yi]}:${pos.toLocaleString()}<br/>Callers: ${callers}`
      }
    },
    legend: {
      data: ['DEL', 'DUP'],
      top: 4, right: 8,
      textStyle: { color: '#6b7280', fontSize: 11 }
    },
    grid: { top: 36, left: 56, right: 16, bottom: 28 },
    xAxis: {
      type: 'value',
      axisLabel: {
        color: '#9ca3af', fontSize: 10,
        formatter: v => v >= 1e6 ? `${(v / 1e6).toFixed(0)}M` : `${(v / 1e3).toFixed(0)}K`
      },
      splitLine: { lineStyle: { color: '#f3f4f6' } }
    },
    yAxis: {
      type: 'category',
      data: chroms.map(c => `chr${c}`),
      axisLabel: { color: '#9ca3af', fontSize: 10 }
    },
    series: [
      {
        name: 'DEL', type: 'scatter', data: del, symbolSize: 5,
        itemStyle: { color: '#ef4444', opacity: 0.8 }
      },
      {
        name: 'DUP', type: 'scatter', data: dup, symbolSize: 5,
        itemStyle: { color: '#3b82f6', opacity: 0.8 }
      }
    ]
  }
})
</script>

<template>
  <VChart :option="option" autoresize style="height: 340px" />
</template>
