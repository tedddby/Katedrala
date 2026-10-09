// The launch gate: requests every external link of the built page and fails unless each one answers 200, so the
// site never goes live pointing at a repository or document that is not public yet. A link with a fragment must
// also land on its target: a heading of the README or Markdown document it points into (GitHub gives headings ids
// made from their text), or an element with that id on any other page. Links within the page (#id) must find
// their target in the page itself. Run after `pnpm build`.
// Usage: node scripts/check-links.mjs [page.html]
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const page = readFileSync(
  process.argv[2] ?? resolve(import.meta.dirname, "..", "out", "index.html"),
  "utf8",
);
const hrefs = [...new Set([...page.matchAll(/href="([^"]+)"/g)].map((match) => decode(match[1])))];

function decode(attribute) {
  return attribute.replaceAll("&amp;", "&").replaceAll("&#x27;", "'").replaceAll("&quot;", '"');
}

let failed = 0;
function report(ok, status, what) {
  if (!ok) failed += 1;
  console.log(`${ok ? "ok  " : "FAIL"} ${status} ${what}`);
}

/** Answers with the response, following redirects as a browser would; some hosts refuse HEAD. */
async function request(url, method) {
  const response = await fetch(url, { method, redirect: "follow" });
  return method === "HEAD" && response.status === 405 ? request(url, "GET") : response;
}

async function statusOf(url) {
  try {
    return (await request(url, "HEAD")).status;
  } catch (error) {
    return error.cause?.code ?? error.message;
  }
}

/**
 * Where a fragment of this URL is defined: a Markdown source GitHub renders (a repository's README, or a .md
 * file shown with /blob/), as its raw text; otherwise the page itself.
 */
function sourceOf(url) {
  const repository = url.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+?)\/?$/);
  if (repository) {
    const [, owner, name] = repository;
    return {
      markdown: true,
      url: `https://raw.githubusercontent.com/${owner}/${name}/HEAD/README.md`,
    };
  }
  const blob = url.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/([^/]+)\/(.+\.md)$/i);
  if (blob) {
    const [, owner, name, ref, path] = blob;
    return {
      markdown: true,
      url: `https://raw.githubusercontent.com/${owner}/${name}/${ref}/${path}`,
    };
  }
  return { markdown: false, url };
}

/** The ids GitHub gives a Markdown document's headings (as github-slugger makes them), and its explicit anchors. */
function markdownAnchors(text) {
  const anchors = new Set();
  const seen = new Map();
  let fenced = false;
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s{0,3}(```|~~~)/.test(line)) fenced = !fenced;
    if (fenced) continue;
    const atx = line.match(/^\s{0,3}#{1,6}\s+(.*?)\s*#*\s*$/);
    const setext =
      /^\s{0,3}(=+|-+)\s*$/.test(lines[i + 1] ?? "") && line.trim() !== "" ? line : null;
    const heading = atx?.[1] ?? setext;
    if (heading !== null && heading !== undefined) {
      const words = heading
        .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
        .replace(/<[^>]+>/g, "")
        .replace(/[`*]/g, "")
        .toLowerCase()
        .replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, "")
        .replace(/ /g, "-");
      const count = seen.get(words) ?? 0;
      seen.set(words, count + 1);
      anchors.add(count === 0 ? words : `${words}-${count}`);
    }
    for (const match of line.matchAll(/<a\s+(?:name|id)="([^"]+)"/g)) anchors.add(match[1]);
  }
  return anchors;
}

function htmlAnchors(text) {
  return new Set([...text.matchAll(/\s(?:id|name)="([^"]+)"/g)].map((match) => decode(match[1])));
}

const external = hrefs.filter((href) => /^https?:\/\//.test(href));
const targets = [...new Set(external.map((href) => href.split("#")[0]))].sort();
const statuses = new Map();
for (const url of targets) {
  const status = await statusOf(url);
  statuses.set(url, status);
  report(status === 200, status, url);
}

for (const href of external.filter((h) => h.includes("#")).sort()) {
  const [url, fragment] = href.split("#");
  if (statuses.get(url) !== 200) {
    report(false, "unreachable", href);
    continue;
  }
  const source = sourceOf(url);
  let anchors;
  try {
    const response = await request(source.url, "GET");
    if (response.status !== 200) throw new Error(`${response.status} for ${source.url}`);
    const text = await response.text();
    anchors = source.markdown ? markdownAnchors(text) : htmlAnchors(text);
  } catch (error) {
    report(false, error.cause?.code ?? error.message, href);
    continue;
  }
  const id = decodeURIComponent(fragment);
  report(anchors.has(id), anchors.has(id) ? "found" : "no such heading", href);
}

const own = htmlAnchors(page);
for (const href of hrefs.filter((h) => h.startsWith("#") && h.length > 1)) {
  const id = decodeURIComponent(href.slice(1));
  report(own.has(id), own.has(id) ? "found" : "no such id", `${href} (in this page)`);
}

const checked =
  targets.length +
  external.filter((h) => h.includes("#")).length +
  hrefs.filter((h) => h.startsWith("#") && h.length > 1).length;
console.log(`${checked} checks, ${failed} failing`);
process.exitCode = failed === 0 ? 0 : 1;
