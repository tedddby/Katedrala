const fs = require("fs");
const doc = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
for (const s of doc.symbols.filter((s) => s.id.startsWith("sym:src/analysis/cache-key.ts#") || s.id === "sym:src/analysis/analysis-service.ts#createAnalysisService")) {
  console.log(JSON.stringify(s).slice(0, 400));
}
const imp = doc.files.find((f) => f.id === "file:src/analysis/analysis-service.ts").imports;
console.log("imports of analysis-service:", JSON.stringify(imp.filter((i) => JSON.stringify(i).includes("cache-key"))).slice(0, 400));
