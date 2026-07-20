<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { useData } from './composables/useData.js'
import { setCoverageFiles } from './composables/useCoverage.js'
import LoadingScreen from './components/LoadingScreen.vue'
import DashboardView from './components/DashboardView.vue'
import AppFooter from './components/AppFooter.vue'
import ceitecLogo from './assets/ceitec-logo.png'
import sampleCnvRaw      from './assets/sample/all_samples_smoothed.tsv?raw'
import sampleCov57Raw    from './assets/sample/sample57.region_coverage.tsv?raw'
import sampleCov99Raw    from './assets/sample/sample99.region_coverage.tsv?raw'
import sampleCov104Raw   from './assets/sample/sample104.region_coverage.tsv?raw'
import sampleCov105Raw   from './assets/sample/sample105.region_coverage.tsv?raw'

const { rows, loading, error, load } = useData()

const folderInput = ref(null)
const folderError = ref('')

function openPicker() {
  folderInput.value.click()
}

function makeFile(name, content) {
  return new File([content], name, { type: 'text/plain' })
}

async function loadDefaultSample() {
  folderError.value = ''
  setCoverageFiles({
    'sample57':  makeFile('sample57.region_coverage.tsv',  sampleCov57Raw),
    'sample99':  makeFile('sample99.region_coverage.tsv',  sampleCov99Raw),
    'sample104': makeFile('sample104.region_coverage.tsv', sampleCov104Raw),
    'sample105': makeFile('sample105.region_coverage.tsv', sampleCov105Raw),
  })
  await load(makeFile('all_samples_smoothed.tsv', sampleCnvRaw))
  // Leave selectedSample at its default ('all') so the dashboard opens on the
  // cohort summary, rather than forcing a single sample's coverage view.
}

async function onFolderSelected(e) {
  const files = Array.from(e.target.files)
  if (!files.length) return

  folderError.value = ''

  const cnvFile = files.find(f => f.name === 'all_samples_smoothed.tsv')
  if (!cnvFile) {
    folderError.value = 'Could not find all_samples_smoothed.tsv in the selected folder.'
    return
  }

  const covMap = {}
  for (const f of files) {
    if (f.name.endsWith('.region_coverage.tsv')) {
      covMap[f.name.replace('.region_coverage.tsv', '')] = f
    }
  }

  // Coverage files are required, not optional — without them the Genome Coverage
  // plot has nothing to show, so refuse to load rather than open a half-empty dashboard.
  if (!Object.keys(covMap).length) {
    folderError.value = 'No *.region_coverage.tsv files found in the selected folder. These are required alongside all_samples_smoothed.tsv.'
    return
  }

  setCoverageFiles(covMap)
  await load(cnvFile)
}

// Animated dots canvas
const dotsCanvas = ref(null)
let animFrame = null

onMounted(() => {
  const canvas = dotsCanvas.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')

  const COLS = ['#21a8c2', '#7ac143', '#101828']
  const DOT_COUNT = 50

  let W, H, dots

  function resize() {
    W = canvas.width  = canvas.offsetWidth
    H = canvas.height = canvas.offsetHeight
  }

  function makeDot() {
    const r = 2 + Math.random() * 3
    return {
      x: Math.random() * W,
      y: Math.random() * H,
      r,
      vx: (Math.random() - 0.5) * 0.35,
      vy: (Math.random() - 0.5) * 0.35,
      color: COLS[Math.floor(Math.random() * COLS.length)],
      alpha: 0.4 + Math.random() * 0.3,
    }
  }

  function init() {
    resize()
    dots = Array.from({ length: DOT_COUNT }, makeDot)
  }

  function draw() {
    ctx.clearRect(0, 0, W, H)

    // Draw connection lines
    for (let i = 0; i < dots.length; i++) {
      for (let j = i + 1; j < dots.length; j++) {
        const dx = dots[i].x - dots[j].x
        const dy = dots[i].y - dots[j].y
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist < 120) {
          ctx.beginPath()
          ctx.moveTo(dots[i].x, dots[i].y)
          ctx.lineTo(dots[j].x, dots[j].y)
          ctx.strokeStyle = `rgba(33,168,194,${0.15 * (1 - dist / 120)})`
          ctx.lineWidth = 1
          ctx.stroke()
        }
      }
    }

    // Draw dots
    for (const d of dots) {
      d.x += d.vx
      d.y += d.vy
      if (d.x < -10) d.x = W + 10
      if (d.x > W + 10) d.x = -10
      if (d.y < -10) d.y = H + 10
      if (d.y > H + 10) d.y = -10

      ctx.beginPath()
      ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2)
      ctx.fillStyle = d.color
      ctx.globalAlpha = d.alpha
      ctx.fill()
      ctx.globalAlpha = 1
    }

    animFrame = requestAnimationFrame(draw)
  }

  const ro = new ResizeObserver(() => { resize() })
  ro.observe(canvas)

  init()
  draw()

  onUnmounted(() => {
    cancelAnimationFrame(animFrame)
    ro.disconnect()
  })
})
</script>

<template>
  <div class="flex flex-col h-screen font-sans" style="background:#fff; color:#101828">
   <div class="flex-1 min-h-0 overflow-hidden relative">

    <!-- ── Folder picker screen ── -->
    <div v-if="!rows.length && !loading" class="h-full relative overflow-hidden flex items-center justify-center">
      <canvas ref="dotsCanvas" class="absolute inset-0 w-full h-full pointer-events-none" />

      <!-- Centered glass card -->
      <div
        class="relative z-10 flex flex-col items-center gap-8 px-16 rounded-2xl"
        style="padding-top: 3.5rem; padding-bottom: 3rem; font-family: 'Poppins', ui-sans-serif, system-ui, sans-serif; background: rgba(255,255,255,0.6); backdrop-filter: blur(18px); -webkit-backdrop-filter: blur(18px); border: 1px solid rgba(255,255,255,0.85); box-shadow: 0 8px 40px rgba(33,168,194,0.08), 0 2px 12px rgba(0,0,0,0.06);"
      >
        <!-- Logo + title -->
        <div class="flex flex-col items-center gap-2">
          <img :src="ceitecLogo" alt="CEITEC BioIT" class="h-12 object-contain" />
          <span class="text-xs tracking-widest uppercase text-gray-400" style="font-weight:300; letter-spacing:0.2em;">CNV Visualization Module</span>
        </div>

        <!-- Divider -->
        <div class="w-full h-px" style="background: linear-gradient(to right, transparent, #e5e7eb, transparent);" />

        <!-- Clickable folder zone -->
        <button
          @click="openPicker"
          class="group flex flex-col items-center gap-6 focus:outline-none"
        >
          <!-- Folder SVG -->
          <div class="folder-float">
            <svg width="160" height="130" viewBox="0 0 160 130" fill="none" xmlns="http://www.w3.org/2000/svg">
              <!-- Folder back -->
              <rect x="8" y="30" width="144" height="90" rx="10" fill="#f3f4f6" stroke="#e5e7eb" stroke-width="1.5"/>
              <!-- Folder tab -->
              <path d="M8 30 Q8 20 18 20 L58 20 L68 30 Z" fill="#e5e7eb"/>
              <!-- Folder front highlight -->
              <rect x="8" y="44" width="144" height="76" rx="10" fill="white" stroke="#e5e7eb" stroke-width="1.5"/>
              <!-- Upload arrow -->
              <g class="arrow-bounce">
                <line x1="80" y1="100" x2="80" y2="68" stroke="#7ac143" stroke-width="2.5" stroke-linecap="round"/>
                <polyline points="68,78 80,66 92,78" stroke="#7ac143" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
                <line x1="66" y1="104" x2="94" y2="104" stroke="#7ac143" stroke-width="2.5" stroke-linecap="round"/>
              </g>
            </svg>
          </div>

          <!-- Label -->
          <div class="text-center">
            <p class="text-2xl tracking-tight" style="color:#101828; font-weight:300; letter-spacing:-0.02em;">Open Data Folder</p>
            <p class="text-sm text-gray-400 mt-1" style="font-weight:300;">Click to browse</p>
          </div>
        </button>

        <!-- Required files note -->
        <div class="text-center space-y-1">
          <p class="text-xs text-gray-400">Required: <code class="text-gray-500">all_samples_smoothed.tsv</code></p>
          <p class="text-xs text-gray-400">Required: <code class="text-gray-500">*.region_coverage.tsv</code> (one per sample)</p>
        </div>

        <!-- Divider -->
        <div class="w-full h-px" style="background: linear-gradient(to right, transparent, #e5e7eb, transparent);" />

        <!-- Default sample button -->
        <div class="flex flex-col items-center gap-2">
          <button
            @click="loadDefaultSample"
            class="px-5 py-2 rounded-lg text-sm font-medium transition-colors"
            style="background: rgba(122,193,67,0.1); color: #5a9a2a; border: 1px solid rgba(122,193,67,0.3);"
            onmouseover="this.style.background='rgba(122,193,67,0.18)'"
            onmouseout="this.style.background='rgba(122,193,67,0.1)'"
          >
            Use default sample
          </button>
          <p class="text-[11px] text-gray-400">Try with built-in example data (sample57, sample99, sample104, sample105)</p>
        </div>

        <p v-if="folderError" class="text-red-400 text-sm">{{ folderError }}</p>
        <p v-if="error"       class="text-red-400 text-sm">{{ error }}</p>
      </div>

      <input ref="folderInput" type="file" webkitdirectory multiple class="hidden" @change="onFolderSelected" />
    </div>

    <LoadingScreen v-else-if="loading" />

    <div v-else-if="error && !rows.length" class="h-full flex flex-col items-center justify-center gap-4">
      <p class="text-red-400 text-sm">{{ error }}</p>
      <button @click="openPicker" class="text-sm underline" style="color:#7ac143">Try another folder</button>
    </div>

    <DashboardView v-else :data="rows" />

   </div>

   <AppFooter />
  </div>
</template>

<style scoped>
@keyframes float {
  0%, 100% { transform: translateY(0px); }
  50%       { transform: translateY(-10px); }
}

@keyframes arrow-up {
  0%, 100% { transform: translateY(0px); opacity: 1; }
  40%       { transform: translateY(-6px); opacity: 0.6; }
  60%       { transform: translateY(-6px); opacity: 0.6; }
}

.folder-float {
  animation: float 2.4s ease-in-out infinite;
}

.folder-float:hover {
  animation-duration: 1.2s;
}

.arrow-bounce {
  animation: arrow-up 2.4s ease-in-out infinite;
}
</style>
