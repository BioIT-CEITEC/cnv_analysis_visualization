<script setup>
import { ref } from 'vue'

const emit = defineEmits(['load'])

const detected    = ref(null)   // { cnvFile, coverageFiles } or null
const scanError   = ref('')
const folderName  = ref('')

function onFolderSelected(e) {
  scanError.value  = ''
  detected.value   = null

  const files = [...e.target.files]
  if (!files.length) return

  // Derive folder name from first file path (webkitRelativePath = "folder/file.ext")
  folderName.value = files[0].webkitRelativePath.split('/')[0] || ''

  const cnvFile = files.find(f =>
    (f.name.toLowerCase().includes('consensus') || f.name.toLowerCase().includes('merged')) &&
    f.name.endsWith('.tsv')
  )

  const coverageFiles = files.filter(f => f.name.endsWith('.per_region_coverage.tsv'))

  if (!cnvFile) {
    scanError.value = 'No consensus/merged .tsv file found in the selected folder.'
    return
  }

  detected.value = { cnvFile, coverageFiles }
  // Auto-load
  emit('load', detected.value)
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-gray-50 px-4">
    <div class="bg-white rounded-2xl border border-gray-200 shadow-sm w-full max-w-md p-8 flex flex-col gap-6">

      <!-- Title -->
      <div class="text-center">
        <h1 class="text-xl font-bold text-violet-600 tracking-tight">CNV Visualization</h1>
        <p class="text-sm text-gray-400 mt-1">Select the folder containing your data files</p>
      </div>

      <!-- Folder picker -->
      <label
        class="flex flex-col items-center justify-center gap-3 border-2 border-dashed rounded-xl px-4 py-10 cursor-pointer transition-colors"
        :class="detected ? 'border-violet-300 bg-violet-50' : 'border-gray-200 hover:border-violet-300 hover:bg-gray-50'"
      >
        <!-- Icon -->
        <svg class="w-10 h-10" :class="detected ? 'text-violet-400' : 'text-gray-300'" fill="none" stroke="currentColor" stroke-width="1.2" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round"
            d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z" />
        </svg>

        <!-- Idle state -->
        <div v-if="!detected && !scanError" class="text-center">
          <p class="text-sm font-medium text-gray-600">Click to select data folder</p>
          <p class="text-xs text-gray-400 mt-1">The app will find the TSV files automatically</p>
        </div>

        <!-- Detected state -->
        <div v-else-if="detected" class="text-center flex flex-col gap-1.5">
          <p class="text-sm font-semibold text-violet-700">{{ folderName }}</p>
          <span class="inline-flex items-center gap-1.5 text-xs text-green-600 font-medium">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5"/>
            </svg>
            {{ detected.cnvFile.name }}
          </span>
          <span v-if="detected.coverageFiles.length" class="inline-flex items-center gap-1.5 text-xs text-green-600 font-medium">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5"/>
            </svg>
            {{ detected.coverageFiles.length }} coverage file{{ detected.coverageFiles.length > 1 ? 's' : '' }}
            ({{ detected.coverageFiles.map(f => f.name.replace('.per_region_coverage.tsv','')).join(', ') }})
          </span>
          <span v-else class="text-xs text-gray-400">No coverage files found</span>
          <p class="text-xs text-violet-500 mt-1 animate-pulse">Loading…</p>
        </div>

        <!-- Error state -->
        <div v-else-if="scanError" class="text-center">
          <p class="text-sm font-medium text-red-500">{{ scanError }}</p>
          <p class="text-xs text-gray-400 mt-1">Click to select a different folder</p>
        </div>

        <input type="file" webkitdirectory multiple class="hidden" @change="onFolderSelected" />
      </label>

      <p class="text-center text-xs text-gray-300">
        Expected: <code class="bg-gray-50 px-1 rounded">*consensus*.tsv</code> &amp;
        <code class="bg-gray-50 px-1 rounded">*.per_region_coverage.tsv</code>
      </p>
    </div>
  </div>
</template>
