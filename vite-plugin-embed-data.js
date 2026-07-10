/**
 * Embeds all data files directly into the JS bundle at build time.
 * This removes all fetch() calls so the app works by double-clicking index.html.
 *
 * virtual:cnv-data       → exports cnvTsv (raw TSV string, ~6 KB)
 * virtual:coverage-data  → exports coverageData (compact pre-parsed object)
 *
 * Compact coverage format per sample:
 *   { GENE: [ [chrom, start, end, [d0, d1, d2, ...]], ... ] }
 *   - one tuple per exon, depths are 1-based positional (index = pos-1)
 *
 * Build mode output:
 *   - dist/data.js   — sets window.__cnvTsv__ and window.__coverageData__
 *   - dist/index.html — has <script src="./data.js"> injected before app scripts
 *   To update data without a full rebuild: npm run generate:data
 */
import { readFileSync, readdirSync, writeFileSync } from 'fs'
import { join, resolve } from 'path'

/** Shared: build compact coverage object from a coverage directory */
function buildCoverageData(publicDir, watchFn) {
  const coverageDir = join(publicDir, 'coverage')
  if (watchFn) watchFn(coverageDir)
  const result = {}

  let files = []
  try {
    files = readdirSync(coverageDir).filter(f => f.endsWith('.per_region_coverage.tsv'))
  } catch { /* coverage/ folder missing */ }

  for (const file of files) {
    const sampleId = file.replace('.per_region_coverage.tsv', '')
    const filePath = join(coverageDir, file)
    if (watchFn) watchFn(filePath)
    const raw = readFileSync(filePath, 'utf-8')
    console.log('[embed-data] coverage', sampleId, Math.round(raw.length / 1024 / 1024), 'MB raw')

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
      const pos   = parseInt(line.slice(tab4 + 1, tab5))   // 1-based
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
    console.log('[embed-data] coverage', sampleId, 'compact:', kb, 'KB')
  }

  return result
}

export function embedDataPlugin() {
  const CNV_ID = 'virtual:cnv-data'
  const COV_ID = 'virtual:coverage-data'
  const R_CNV  = '\0' + CNV_ID
  const R_COV  = '\0' + COV_ID
  let publicDir = ''
  let outDir    = ''
  let command   = ''

  return {
    name: 'embed-data',

    configResolved(config) {
      publicDir = config.publicDir
      outDir    = resolve(config.root, config.build.outDir)
      command   = config.command
    },

    resolveId(id) {
      if (id === CNV_ID) return R_CNV
      if (id === COV_ID) return R_COV
    },

    load(id) {
      // ── Main CNV TSV ────────────────────────────────────────────────────
      if (id === R_CNV) {
        if (command === 'build') {
          // Build mode: data.js will set window.__cnvTsv__ at runtime
          return `export const cnvTsv = window.__cnvTsv__`
        }
        // Dev mode: embed directly for instant HMR
        const filePath = join(publicDir, 'merged_target_consensus.tsv')
        this.addWatchFile(filePath)
        const tsv = readFileSync(filePath, 'utf-8')
        console.log('[embed-data] cnv tsv:', Math.round(tsv.length / 1024), 'KB')
        return `export const cnvTsv = ${JSON.stringify(tsv)}`
      }

      // ── Coverage TSVs ───────────────────────────────────────────────────
      if (id === R_COV) {
        if (command === 'build') {
          // Build mode: data.js will set window.__coverageData__ at runtime
          return `export const coverageData = window.__coverageData__`
        }
        // Dev mode: embed directly for instant HMR
        const result = buildCoverageData(publicDir, (p) => this.addWatchFile(p))
        return `export const coverageData = ${JSON.stringify(result)}`
      }
    },

    // Runs after all bundle files are written to disk (including singlefile's index.html)
    closeBundle() {
      if (command !== 'build') return

      // 1. Read & process TSV data
      const cnvFilePath = join(publicDir, 'merged_target_consensus.tsv')
      const cnvTsv = readFileSync(cnvFilePath, 'utf-8')
      console.log('[embed-data] cnv tsv:', Math.round(cnvTsv.length / 1024), 'KB')

      const coverageData = buildCoverageData(publicDir)

      // 2. Write data.js (sets window globals read by the app at startup)
      const dataJs =
        `window.__cnvTsv__ = ${JSON.stringify(cnvTsv)};\n` +
        `window.__coverageData__ = ${JSON.stringify(coverageData)};\n`
      writeFileSync(join(outDir, 'data.js'), dataJs, 'utf-8')
      console.log('[embed-data] wrote data.js', Math.round(dataJs.length / 1024), 'KB')

      // 3. Inject <script src="./data.js"> into index.html before the app script
      //    Regular (non-module) scripts execute synchronously before deferred module scripts,
      //    so the globals are guaranteed to be set when the app module reads them.
      const htmlPath = join(outDir, 'index.html')
      let html = readFileSync(htmlPath, 'utf-8')
      html = html.replace(/(<script\b)/i, '<script src="./data.js"></script>\n  $1')
      writeFileSync(htmlPath, html, 'utf-8')
      console.log('[embed-data] injected <script src="./data.js"> into index.html')
    }
  }
}
