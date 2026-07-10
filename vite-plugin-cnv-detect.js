import { readdirSync } from "fs";

export function cnvDetectPlugin() {
  const virtualId = "virtual:cnv-files";
  const resolvedId = "\0" + virtualId;
  let publicDir = "";

  return {
    name: "cnv-detect",

    configResolved(config) {
      publicDir = config.publicDir;
    },

    resolveId(id) {
      if (id === virtualId) return resolvedId;
    },

    load(id) {
      if (id !== resolvedId) return;

      let allTsv = [];
      try {
        allTsv = readdirSync(publicDir).filter(
          (f) =>
            f.toLowerCase().endsWith(".tsv") ||
            f.toLowerCase().endsWith(".csv") ||
            f.toLowerCase().endsWith(".txt"),
        );
      } catch {
        /* public/ missing */
      }

      const hasCnv = allTsv.filter((f) => f.toLowerCase().includes("cnv"));
      const hasConsensus = allTsv.filter((f) =>
        f.toLowerCase().includes("consensus"),
      );

      // Pick the best match in priority order
      const files = hasCnv.length
        ? hasCnv
        : hasConsensus.length
          ? hasConsensus
          : allTsv;

      console.log("[cnv-detect] publicDir:", publicDir);
      console.log("[cnv-detect] matched:", files.length ? files : "none");
      return `export const cnvFiles = ${JSON.stringify(files)}`;
    },
  };
}
