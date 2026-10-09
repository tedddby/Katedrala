import { readFileSync } from "node:fs";
const S = "/home/user/Katedrala/site/components/stage";
const M = await import(`${S}/model.ts`);
const T = await import(`${S}/timeline.ts`);
const data = JSON.parse(readFileSync("/home/user/Katedrala/site/public/data/codeverse-graph.json", "utf8"));
const model = M.buildModel(data);
const idx = (p) => model.paths.indexOf(p);
const a = idx("src/analysis/analysis-service.ts");
const b = idx("src/analysis/cache-key.ts");
const ty = idx("src/graph/model/types.ts");
console.log({ a, b, ty, crown: model.crown, n: model.n, m: model.m, maxLevel: model.maxLevel });
let chain = -1;
for (let k = 0; k < model.m; k++) if (model.edgeA[k] === a && model.edgeB[k] === b) chain = k;
console.log("chain a->b", chain, "load", model.edgeLoad[chain], "sag", model.edgeSag[chain]);
for (const f of ["wide", "tall"]) {
  console.log(f, "a", T.standingOf(model, f, a).map((x) => x.toFixed(2)), "b", T.standingOf(model, f, b).map((x) => x.toFixed(2)), "types", T.standingOf(model, f, ty).map((x) => x.toFixed(2)), "crown", T.standingOf(model, f, model.crown).map((x) => x.toFixed(2)));
  const keys = T.hangCameraKeys(model, f);
  console.log(" last Act I key", keys[keys.length - 1].map((x) => +x.toFixed(3)));
  console.log(" still camera", JSON.stringify(T.stillCamera(model, f)));
}
console.log("H", T.modelHeight(model));
