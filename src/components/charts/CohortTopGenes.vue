<!--
  Top Affected Genes — horizontal stacked bar of the 15 most frequently affected genes
  in the current view, split into DEL (red) vs DUP (blue). Each gene counts once per sample
  (not once per call). Shown both for a single selected sample and, when "All (cohort)"
  is selected, across every sample.
-->
<script setup>
import { computed, ref } from 'vue'
import { VChart } from '../../utils/echarts.js'

const props = defineProps({ data: Array })

const chartRef = ref(null)
defineExpose({ chartRef })

const TOP_N = 15

// Counts are per sample, not per call: several calls of the same type in the same gene and
// sample (e.g. two adjacent RB1 deletions) count once, so each bar = number of affected samples.
const topGenes = computed(() => {
  const counts = {} // gene -> { del: Set, dup: Set, samples: Set } (sets of sample IDs)
  for (const row of props.data) {
    if (!row.gene) continue
    const sample = row.sample || ''
    // A call spanning several genes ("A, B") affects each of them
    for (const gene of row.gene.split(',').map(g => g.trim()).filter(Boolean)) {
      const bucket = counts[gene] || (counts[gene] = { del: new Set(), dup: new Set(), samples: new Set() })
      if (row.consensus_type === 'DEL') bucket.del.add(sample)
      else if (row.consensus_type === 'DUP') bucket.dup.add(sample)
      if (sample) bucket.samples.add(sample)
    }
  }
  return Object.entries(counts)
    .map(([gene, c]) => ({ gene, del: c.del.size, dup: c.dup.size, total: c.del.size + c.dup.size, samples: [...c.samples].sort() }))
    .sort((a, b) => b.total - a.total)
    .slice(0, TOP_N)
    .reverse() // highest count renders at the top of the horizontal chart
})

const option = computed(() => {
  const genes = topGenes.value
  return {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      backgroundColor: '#ffffff',
      borderColor: '#e5e7eb',
      textStyle: { color: '#1f2937', fontSize: 12 },
      formatter(params) {
        const g = genes.find(gg => gg.gene === params[0].axisValue)
        if (!g) return ''
        let html = `<b>${g.gene}</b>`
        params.forEach(p => { html += `<br/>${p.marker}${p.seriesName}: <b>${p.value}</b>` })
        html += `<br/>Affected samples: <b>${g.samples.length ? g.samples.join(', ') : '—'}</b>`
        return html
      },
    },
    legend: {
      data: ['DEL', 'DUP'],
      top: 4, right: 8,
      textStyle: { color: '#6b7280', fontSize: 11 }
    },
    grid: { top: 36, left: 72, right: 24, bottom: 24 },
    xAxis: {
      type: 'value',
      axisLabel: { color: '#9ca3af', fontSize: 10 },
      splitLine: { lineStyle: { color: '#f3f4f6' } },
      minInterval: 1,
    },
    yAxis: {
      type: 'category',
      data: genes.map(g => g.gene),
      axisLabel: { color: '#374151', fontSize: 11 },
    },
    series: [
      {
        name: 'DEL',
        type: 'bar',
        stack: 'total',
        data: genes.map(g => g.del),
        itemStyle: { color: '#ef4444' },
        barMaxWidth: 18,
      },
      {
        name: 'DUP',
        type: 'bar',
        stack: 'total',
        data: genes.map(g => g.dup),
        itemStyle: { color: '#3b82f6' },
        barMaxWidth: 18,
      },
    ]
  }
})
</script>

<template>
  <VChart v-if="topGenes.length" ref="chartRef" :option="option" autoresize style="width: 100%; height: 400px" />
  <div v-else class="h-[280px] flex items-center justify-center text-sm text-gray-400">No data</div>
</template>
