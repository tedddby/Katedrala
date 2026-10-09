// The launch gate: requests every external link of the built page and fails unless each one answers 200, so the
// site never goes live pointing at a repository or document that is not public yet. Run after `pnpm build`.
// Usage: node scripts/check-links.mjs
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const page = readFileSync(resolve(import.meta.dirname, "..", "out", "index.html"), "utf8");
const links = [
  ...new Set([...page.matchAll(/href="(https?:\/\/[^"#]+)/g)].map((match) => match[1])),
];

let failed = 0;
for (const url of links.sort()) {
  let status;
  try {
    // Some hosts refuse HEAD; a GET then settles it. Redirects are followed, as a browser would.
    status = (await fetch(url, { method: "HEAD", redirect: "follow" })).status;
    if (status === 405) status = (await fetch(url, { redirect: "follow" })).status;
  } catch (error) {
    status = error.cause?.code ?? error.message;
  }
  if (status !== 200) failed += 1;
  console.log(`${status === 200 ? "ok  " : "FAIL"} ${status} ${url}`);
}
console.log(`${links.length} links, ${failed} failing`);
process.exitCode = failed === 0 ? 0 : 1;
