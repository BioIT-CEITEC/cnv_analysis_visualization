/**
 * Regenerates dist/data.js from public/ TSV files without a full Vite rebuild.
 *
 * Usage:
 *   npm run generate:data
 *   node generate-data.js
 *   node generate-data.js --public ./public --out ./dist
 *
 * After running, copy the updated dist/data.js next to dist/index.html.
 * The app reads window.__cnvTsv__ and window.__coverageData__ from data.js at startup.
 */
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'fs'
import { join, resolve } from 'path'
import { fileURLToPath } from 'url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

// Parse --public and --out CLI args (with defaults)
const args = process.argv.slice(2)
function getArg(flag, def) {
  const i = args.indexOf(flag)
  return i !== -1 && args[i + 1] ? resolve(args[i + 1]) : resolve(__dirname, def)
}
const publicDir = getArg('--public', 'public')
const outDir    = getArg('--out',    'dist')

// ── Build compact coverage object ──────────────────────────────────────────────
function buildCoverageData() {
  const coverageDir = join(publicDir, 'coverage')
  const result = {}

  let files = []
  try {
    files = readdirSync(coverageDir).filter(f => f.endsWith('.per_region_coverage.tsv'))
  } catch {
    console.warn('[generate-data] No coverage/ directory found, skipping coverage data.')
    return result
  }

  for (const file of files) {
    const sampleId = file.replace('.per_region_coverage.tsv', '')
    const filePath = join(coverageDir, file)
    const raw = readFileSync(filePath, 'utf-8')
    console.log(`[generate-data] coverage ${sampleId} ${Math.round(raw.length / 1024 / 1024)} MB raw`)

    const geneMap = {}
    const lines = raw.split('\n')
    for (const line of lines) {
      if (!line) continue
      const tab1 = line.indexOf('\t')
      const tab2 = line.indexOf('\t', tab1 + 1)
      const tab3 = line.indexOf('\t', tab2 + 1)
      const tab4 = line.indexOf('\t', tab3 + 1)
      const tab5 = line.indexOf('\t', tab4 + 1)
      if (tab5 === -1) continue

      const chrom = line.slice(0, tab1)
      const start = parseInt(line.slice(tab1 + 1, tab2))
      const end   = parseInt(line.slice(tab2 + 1, tab3))
      const gene  = line.slice(tab3 + 1, tab4)
      const pos   = parseInt(line.slice(tab4 + 1, tab5))
      const depth = parseInt(line.slice(tab5 + 1))

      if (!geneMap[gene]) geneMap[gene] = {}
      const key = `${chrom}:${start}-${end}`
      if (!geneMap[gene][key]) geneMap[gene][key] = [chrom, start, end, []]
      geneMap[gene][key][3][pos - 1] = depth
    }

    const sorted = {}
    for (const gene of Object.keys(geneMap)) {
      sorted[gene] = Object.values(geneMap[gene])
        .sort((a, b) =>
          String(a[0]).localeCompare(String(b[0]), undefined, { numeric: true }) || a[1] - b[1]
        )
    }

    result[sampleId] = sorted
    const kb = Math.round(JSON.stringify(sorted).length / 1024)
    console.log(`[generate-data] coverage ${sampleId} compact: ${kb} KB`)
  }

  return result
}

// ── Main ───────────────────────────────────────────────────────────────────────
console.log(`[generate-data] public: ${publicDir}`)
console.log(`[generate-data] out:    ${outDir}`)

const cnvFilePath = join(publicDir, 'merged_target_consensus.tsv')
const cnvTsv = readFileSync(cnvFilePath, 'utf-8')
console.log(`[generate-data] cnv tsv: ${Math.round(cnvTsv.length / 1024)} KB`)

const coverageData = buildCoverageData()

const dataJs =
  `window.__cnvTsv__ = ${JSON.stringify(cnvTsv)};\n` +
  `window.__coverageData__ = ${JSON.stringify(coverageData)};\n`

mkdirSync(outDir, { recursive: true })
writeFileSync(join(outDir, 'data.js'), dataJs, 'utf-8')
console.log(`[generate-data] wrote ${join(outDir, 'data.js')} (${Math.round(dataJs.length / 1024)} KB)`)
console.log('[generate-data] done — copy dist/data.js next to index.html to update.')
