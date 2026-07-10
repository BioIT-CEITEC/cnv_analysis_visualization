<!--
  Copy Number Scatter — one dot per target per caller, Y = CN value.
  Dashed line at CN=2 (diploid baseline).
  Only plots points where the caller actually made a call (!= '0').
  Capped at 400 targets to keep it readable.
-->
<script setup>
import { computed } from 'vue'
import { VChart } from '../../utils/echarts.js'

const props = defineProps({ data: Array })

function getGene(name) {
  const m = name?.match(/gene_symbol=([^;]+)/)
  return m ? m[1] : ''
}

const option = computed(() => {
  const rows = props.data.slice(0, 400)

  const series = (callerKey, cnKey, color, name) => ({
    name,
    type: 'scatter',
    symbolSize: 5,
    itemStyle: { color, opacity: 0.75 },
    data: rows
      .map((r, i) => r[callerKey] !== '0' ? [i, r[cnKey], i] : null)
      .filter(Boolean),
    tooltip: {
      formatter: p => {
        const r = rows[p.data[2]]
        return `<b>${getGene(r?.target_name)}</b><br/>${name}: ${p.data[1]}<br/>chr${r?.CHROM}:${r?.START?.toLocaleString()}`
      }
    }
  })

  return {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'item',
      backgroundColor: '#ffffff',
      borderColor: '#e5e7eb',
      textStyle: { color: '#1f2937', fontSize: 12 }
    },
    legend: {
      data: ['ExomeDepth', 'cnMOPS', 'panelcnMOPS', 'CNVkit'],
      top: 4, right: 8,
      textStyle: { color: '#6b7280', fontSize: 11 }
    },
    grid: { top: 36, left: 48, right: 16, bottom: 28 },
    xAxis: {
      type: 'category',
      data: rows.map((_, i) => i),
      axisLabel: { show: false },
      axisTick: { show: false }
    },
    yAxis: {
      type: 'value',
      name: 'CN',
      nameTextStyle: { color: '#9ca3af', fontSize: 10 },
      axisLabel: { color: '#9ca3af', fontSize: 10 },
      splitLine: { lineStyle: { color: '#f3f4f6' } },
      min: 0
    },
    series: [
      series('exomedepth',  'exomedepth_CN',  '#f59e0b', 'ExomeDepth'),
      series('cnmops',      'cnmops_CN',      '#16a34a', 'cnMOPS'),
      series('panelcnmops', 'panelcnmops_CN', '#7c3aed', 'panelcnMOPS'),
      series('cnvkit',      'cnvkit_CN',      '#3b82f6', 'CNVkit'),
      {
        type: 'scatter', data: [], silent: true,
        markLine: {
          silent: true, symbol: 'none',
          data: [{ yAxis: 2, lineStyle: { color: '#d1d5db', type: 'dashed', width: 1 } }],
          label: { formatter: 'CN=2', color: '#9ca3af', fontSize: 10 }
        }
      }
    ]
  }
})
</script>

<template>
  <VChart :option="option" autoresize style="height: 320px" />
</template>
