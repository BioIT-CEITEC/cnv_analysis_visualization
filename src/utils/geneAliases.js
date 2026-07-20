// Known historical HGNC gene-symbol renames. Bridges cases where the coverage-region
// annotation and the CNV consensus annotation were generated with different symbol
// versions for the same gene (e.g. an older exon/target panel vs. a newer caller
// annotation), so gene-name matching still works across the two files.
//
// Add more `OLD: 'NEW'` entries here as you run into other symbol mismatches.
export const GENE_ALIASES = {
  MUT: 'MMUT', // HGNC renamed MUT → MMUT in 2023 to resolve a symbol clash
  FH:  'CFH',  // Older panel/BED files often label the CFH region "FH", short for its
               // product name "Factor H" (as in "Factor H deficiency"), instead of
               // the official HGNC symbol CFH. Not to be confused with the unrelated
               // Fumarate Hydratase gene, which HGNC does call "FH" — but that gene
               // sits ~45Mb away on chr1, so a region-level FH match here is CFH.
  COH1: 'VPS13B', // COH1 (Cohen syndrome 1) was the original symbol before HGNC renamed
                  // it to VPS13B — some older panel files still carry the COH1 label.
}

export function canonicalGene(gene) {
  return GENE_ALIASES[gene] || gene
}
