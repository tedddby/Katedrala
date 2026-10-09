// Lists every numeric literal in acts/copy.ts with its line, so the "no numbers outside formatting" rule can be read.
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
const require = createRequire("/home/user/Katedrala/site/package.json");
const ts = require("typescript");
const file = "/home/user/Katedrala/site/components/stage/acts/copy.ts";
const text = readFileSync(file, "utf8");
const src = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
const out = [];
const visit = (node) => {
  if (ts.isNumericLiteral(node) || ts.isBigIntLiteral(node)) {
    const { line } = src.getLineAndCharacterOfPosition(node.getStart());
    out.push({ line: line + 1, value: node.text, code: text.split("\n")[line].trim() });
  }
  // Digits inside strings and templates too (a number spelled into copy).
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) {
    if (/\d/.test(node.text)) {
      const { line } = src.getLineAndCharacterOfPosition(node.getStart());
      out.push({ line: line + 1, value: `"${node.text}"`, code: text.split("\n")[line].trim() });
    }
  }
  ts.forEachChild(node, visit);
};
visit(src);
for (const o of out) console.log(`${o.line}\t${o.value}\t${o.code}`);
console.log(`${out.length} literals`);
