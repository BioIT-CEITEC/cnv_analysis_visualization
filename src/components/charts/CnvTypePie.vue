<script setup>
import { computed, ref } from "vue";
import { VChart } from "../../utils/echarts.js";

const props = defineProps({ data: Array, chromOrder: Array });

const chartRef = ref(null);
defineExpose({ chartRef });

const option = computed(() => {
  const delCount = props.data.filter((r) => r.consensus_type === "DEL").length;
  const dupCount = props.data.filter((r) => r.consensus_type === "DUP").length;

  const chroms = props.chromOrder.filter((c) =>
    props.data.some((r) => r.CHROM === c),
  );

  const border = { borderWidth: 1.5, borderColor: "#ffffff" };
  const delSegs = [];
  const dupSegs = [];
  chroms.forEach((c) => {
    const del = props.data.filter((r) => r.CHROM === c && r.consensus_type === "DEL").length;
    const dup = props.data.filter((r) => r.CHROM === c && r.consensus_type === "DUP").length;
    if (del > 0) delSegs.push({ value: del, name: `chr${c} DEL`, tooltip: { formatter: `chr${c} DEL: ${del}` }, itemStyle: { color: "#fca5a5", ...border } });
    if (dup > 0) dupSegs.push({ value: dup, name: `chr${c} DUP`, tooltip: { formatter: `chr${c} DUP: ${dup}` }, itemStyle: { color: "#93c5fd", ...border } });
  });
  const outerData = [...delSegs, ...dupSegs];

  return {
    backgroundColor: "transparent",
    tooltip: {
      trigger: "item",
      backgroundColor: "#ffffff",
      borderColor: "#e5e7eb",
      textStyle: { color: "#1f2937", fontSize: 12 },
      formatter: "{b}: {c} ({d}%)",
    },
    legend: { show: false },
    series: [
      {
        name: "Type",
        type: "pie",
        radius: ["30%", "50%"],
        center: ["50%", "50%"],
        startAngle: 90,
        data: [
          { value: delCount, name: "DEL", itemStyle: { color: "#ef4444", borderWidth: 1.5, borderColor: "#ffffff" } },
          { value: dupCount, name: "DUP", itemStyle: { color: "#3b82f6", borderWidth: 1.5, borderColor: "#ffffff" } },
        ],
        label: {
          show: true,
          position: "inner",
          formatter: "{b}\n{c}",
          color: "#fff",
          fontSize: 11,
          fontWeight: "bold",
        },
        emphasis: {
          itemStyle: { shadowBlur: 10, shadowColor: "rgba(0,0,0,0.2)" },
        },
      },
      {
        name: "Chromosome",
        type: "pie",
        radius: ["55%", "75%"],
        center: ["50%", "50%"],
        startAngle: 90,
        data: outerData,
        label: {
          show: true,
          formatter: (p) => p.name.replace(" DEL", "").replace(" DUP", ""),
          fontSize: 10,
          color: "#374151",
        },
        labelLine: { length: 6, length2: 8 },
        tooltip: { formatter: (p) => p.data.tooltip?.formatter ?? p.name },
        emphasis: {
          itemStyle: {
            shadowBlur: 10,
            shadowColor: "rgba(0,0,0,0.2)",
            borderWidth: 3,
            borderColor: "#ffffff",
          },
        },
      },
    ],
  };
});
</script>

<template>
  <VChart ref="chartRef" :option="option" autoresize style="height: 300px" />
</template>
