// Serves the static export in `out/` for a local preview of the built site: `pnpm build && pnpm serve`.
// Usage: node scripts/serve.mjs [port]   (default 3000)
import { createReadStream, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";

const root = resolve(import.meta.dirname, "..", "out");
const port = Number(process.argv[2] ?? process.env.PORT ?? 3000);

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

/** Resolves a request path inside `out/`: directories serve their index.html (the export uses trailing slashes). */
function locate(pathname) {
  const path = normalize(decodeURIComponent(pathname)).replace(/^([/\\])+/, "");
  const file = resolve(root, path);
  if (file !== root && !file.startsWith(root + sep)) return undefined;
  try {
    const stat = statSync(file);
    if (stat.isFile()) return file;
    if (stat.isDirectory()) {
      const index = join(file, "index.html");
      if (statSync(index).isFile()) return index;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

createServer((request, response) => {
  const { pathname } = new URL(request.url ?? "/", "http://localhost");
  const file = locate(pathname);
  const target = file ?? join(root, "404.html");
  response.writeHead(file === undefined ? 404 : 200, {
    "content-type": TYPES[extname(target)] ?? "application/octet-stream",
  });
  createReadStream(target).pipe(response);
}).listen(port, () => {
  console.log(`Serving ${root} at http://localhost:${port}/`);
});
