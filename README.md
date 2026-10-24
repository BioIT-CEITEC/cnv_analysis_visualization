# CNV Visualization Module

An interactive browser-based dashboard for visualizing the results of the `cnv_analysis` pipeline (Copy Number Variation calls and per-region coverage). Developed by the **CEITEC BioIT Bioinformatics Core Facility**.

**Live version:** https://bioit-ceitec.github.io/cnv_analysis_visualization/

---

## Features

- **Variants table** — every consensus CNV call, sortable by any column and paginated. A toggleable per-column filter row is included. It also shows:
  - affected exons
  - the overlapping transcript IDs (linked to Ensembl)
  - the callers that detected the call
  - the clinical classification
- **Cohort and sample views** — pick "All (cohort)" for a cohort-wide summary, or a single sample (the sample selector has a search box). Clicking a table row in sample view jumps to that region in the coverage plot.
- **Variant Type Distribution** — nested pie chart of DEL / DUP counts, overall and per chromosome
- **Genome Coverage** — average read depth per target region for the selected sample and gene. It includes:
  - a gene track with GTF annotation (gene name, type, strand, transcript/exon, intronic positions)
  - tooltips with the per-caller CN labels, classification and dosage-sensitive genes of the overlapping call
  - **Cohort avg** overlay: the mean depth per region across all loaded samples
  - **Normalize to cohort (Z-score)**: depth shown as standard deviations from each region's cohort mean
- **Top Affected Genes** — the 15 most frequently affected genes (DEL vs DUP), per sample or cohort-wide
- **Export** — the table as `.xlsx`, and any plot as PNG/JPEG at 72–300 DPI (set under *Export Settings* in the sidebar)
- **No server required** — all data is processed locally in the browser and never uploaded. The production build is a single self-contained HTML file.

---

## Using the app

Open the [live version](https://bioit-ceitec.github.io/cnv_analysis_visualization/) or a local build (see [Building a standalone HTML file](#building-a-standalone-html-file)). The intro screen has two options:

- **Open Data Folder** — select a folder containing your pipeline output (see [Input Data Format](#input-data-format))
- **Use default sample** — loads built-in, anonymized example data (sample57, sample99, sample104, sample105) so you can explore the app without your own data

**Browser support:** use a recent version of Chrome, Edge, Firefox or Safari. Folder selection relies on the `webkitdirectory` file-input feature. Opening a folder may not work in some mobile browsers, but the default sample still does.

---

## Input Data Format

Put all files in one folder and select it with **Open Data Folder**. The folder must contain `all_samples_smoothed.tsv` **and** at least one `*.region_coverage.tsv` file. A folder without coverage files is rejected. Any other files in the folder are ignored.

```
my-data/
├── all_samples_smoothed.tsv
├── SAMPLE_01.region_coverage.tsv
├── SAMPLE_02.region_coverage.tsv
└── SAMPLE_03.region_coverage.tsv
```

The sample ID is taken from the coverage file name (`SAMPLE_01.region_coverage.tsv` → `SAMPLE_01`). It must match the `sample` column in `all_samples_smoothed.tsv`.

### `all_samples_smoothed.tsv`

The consensus CNV calls for all samples: tab-separated, **with a header row**, one row per call.

| Column | Description |
|---|---|
| `sample` | Sample ID |
| `CHROM`, `START`, `END` | Call coordinates |
| `type` | `DEL` or `DUP` |
| `n_targets` | Number of target regions in the call |
| `n_callers` | Number of callers supporting the call |
| `callers` | Supporting callers, `;`-separated (e.g. `gatk_gcnv;panelcnmops`) |
| `genes` | Genes from the caller annotation |
| `BED_gene_name` | Gene name(s) from the target BED. Used instead of `genes` when present, because it matches the coverage files |
| `cn_labels` | Copy number per caller (e.g. `panelcnmops:3;gatk_gcnv:3`) |
| `classifications` | Clinical classification |
| `max_total_score` | Classification score |
| `target_names` | Affected targets (`GENE:chrom:start-end:exonN`, `;`-separated) |
| `dosage_sensitive_genes` | Known or predicted dosage-sensitive genes |

Files from older versions of the pipeline are still accepted. Those files used different column names: `consensus_type`, `Classification`, `Total score`, `GFT_genes` and `SVLEN`.

### `<sample>.region_coverage.tsv`

The per-region coverage of one sample: tab-separated, **no header row**, one row per target region.

| # | Column | Example |
|---|---|---|
| 1 | chrom | `1` |
| 2 | start | `1373795` |
| 3 | end | `1373932` |
| 4 | gene (BED name) | `AIP` |
| 5 | avg_coverage | `1266.09` |
| 6 | stdev_coverage | `156.43` |
| 7 | region_length | `137` |
| 8 | bases_covered | `137` |
| 9 | fraction_covered | `1.000000` |
| 10 | strand | `-` |
| 11 | gene_type | `protein_coding` |
| 12 | gene_name (GTF) | `AURKAIP1` |
| 13 | transcript_exon | `AURKAIP1[ENST00000338338]:exon4` |

`NA` is treated as a missing value. Older 9-column files (columns 1–9) and 8-column files (without `stdev_coverage`) are still accepted. With those files, the GTF annotation is simply not shown.

---

## Development

### Prerequisites

**Node.js 20.19+ or 22.12+** and **npm**. Vite 8 does not run on Node 18.

```bash
node --version   # should print v20.19+ or v22.12+
npm --version
```

If you don't have Node.js yet, download the **LTS** version from https://nodejs.org. npm is included.

### Run locally

```bash
git clone https://github.com/BioIT-CEITEC/cnv_analysis_visualization.git
cd cnv_analysis_visualization
npm install
npm run dev
```

Open the URL that is printed (usually `http://localhost:5173`).

### Building a standalone HTML file

```bash
npm run build
```

This produces `dist/index.html`, with all JavaScript, CSS, images and the default sample data inlined. Copy this single file anywhere and open it by double-clicking; no server or internet connection is needed. The only exception is the Poppins web font, which falls back to a system font when offline.

Use `npm run preview` to serve the build locally.

### Project structure

```
src/
├── App.vue                  # Intro screen, folder loading, default sample
├── components/
│   ├── DashboardView.vue    # Sidebar + dashboard layout
│   ├── FilterBar.vue        # Sample selector
│   ├── ChartInfo.vue        # "About this chart" popups
│   └── charts/              # DataTable, CnvTypePie, GenomeCoverage, CohortTopGenes
├── composables/
│   ├── useData.js           # Parses all_samples_smoothed.tsv
│   ├── useCoverage.js       # Parses coverage files, cohort mean/stdev
│   ├── useFilters.js        # Sample selection
│   └── useExportSettings.js # Image export format/DPI
├── utils/
│   ├── callers.js           # Display names for CNV callers
│   ├── geneAliases.js       # Historical HGNC symbol renames (add new ones here)
│   └── version.js           # App version (read from package.json)
└── assets/sample/           # Built-in default sample data
```

To release a new version, bump `version` in `package.json`. The version shown in the footer is read from it.

---

## Deployment

Every push to `main` triggers the GitHub Actions workflow (`.github/workflows/deploy.yml`). It builds the app and publishes `dist/` to GitHub Pages.
