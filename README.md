# CNV Visualization Module

An interactive browser-based dashboard for visualizing Copy Number Variation (CNV) analysis results. Developed by the **CEITEC BioIT Bioinformatics Core Facility**.

---

## Features

- **Data Table** — sortable, paginated list of all CNV calls with multi-row selection
- **DEL / DUP Pie Chart** — nested chart showing CNV type distribution per chromosome
- **Genome Coverage** — per-region average read depth with variant span overlay
- **Filters** — sample, chromosome, CNV type, min. callers, caller, gene, classification
- **No server required** — runs entirely in the browser; works by double-clicking a single HTML file

---

## Prerequisites

You need **Node.js** (v18 or newer) and **npm** installed on your machine.

### Check if already installed

```bash
node --version
npm --version
```

### Install Node.js

Download and install from the official website: **https://nodejs.org**

Choose the **LTS** version (recommended). npm is included automatically.

After installation, verify:

```bash
node --version   # should print v18.x or higher
npm --version    # should print 9.x or higher
```

---

## Getting Started

### 1. Clone the repository

```bash
git clone <repository-url>
cd to the repo
```

### 2. Install dependencies

```bash
npm install
```

### 3. Run the development server

```bash
npm run dev
```

Open your browser at the URL shown (usually `http://localhost:5173`).

You will see the intro screen with two options:

- **Open Data Folder** — select your own data folder
- **Use default sample** — loads built-in example data (anonymized samples sample57, sample99, sample104, sample105) so you can explore the app immediately without any data

---

## Input Data Format

Place your files in a single folder and select it using "Open Data Folder".

**Example folder structure:**

```
my-data/
├── all_samples_smoothed.tsv
├── SAMPLE_01.region_coverage.tsv
├── SAMPLE_02.region_coverage.tsv
└── SAMPLE_03.region_coverage.tsv
```

---

## Deploy to GitHub Pages

Push to the `main` branch and GitHub Actions will automatically build and deploy:

```bash
git add .
git commit -m "your message"
git push
```
