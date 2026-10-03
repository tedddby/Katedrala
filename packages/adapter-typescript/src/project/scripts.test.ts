import { describe, expect, it } from "vitest";
import { scriptFiles, tokenizeScript } from "./scripts.js";

describe("tokenizeScript", () => {
  it("splits commands and respects quotes", () => {
    expect(tokenizeScript(`a "b c" 'd e' && f || g; h | i & j\nk`)).toEqual([
      ["a", "b c", "d e"],
      ["f"],
      ["g"],
      ["h"],
      ["i"],
      ["j"],
      ["k"],
    ]);
  });

  it("handles escapes and keeps Windows path separators", () => {
    expect(tokenizeScript(`node a\\ b.js "q\\"x"`)).toEqual([["node", "a b.js", 'q"x']]);
    expect(tokenizeScript("node .\\dist\\server.js")).toEqual([["node", ".\\dist\\server.js"]]);
    expect(tokenizeScript(`node ""`)).toEqual([["node", ""]]);
  });
});

describe("scriptFiles", () => {
  it.each([
    ["node dist/server.js", ["dist/server.js"]],
    ["node dist/server.js --port 3000", ["dist/server.js"]],
    [
      "node --enable-source-maps -r dotenv/config --import tsx --env-file .env src/main.ts",
      ["src/main.ts"],
    ],
    ["node --env-file=.env --inspect=9229 src/main.js", ["src/main.js"]],
    ["NODE_ENV=production node build/index.js", ["build/index.js"]],
    ["cross-env NODE_ENV=test DEBUG=* ts-node -P tsconfig.json src/cli.ts", ["src/cli.ts"]],
    ["tsx watch src/server.ts", ["src/server.ts"]],
    ["tsx --tsconfig tsconfig.dev.json src/server.ts", ["src/server.ts"]],
    ["npx tsx scripts/seed.ts", ["scripts/seed.ts"]],
    ["npx --yes ts-node src/x.ts", ["src/x.ts"]],
    ["pnpm exec tsx src/a.ts", ["src/a.ts"]],
    ["ts-node-dev --respawn --transpile-only src/index.ts", ["src/index.ts"]],
    ["tsnd --respawn src/index.ts", ["src/index.ts"]],
    ["babel-node src/server.js", ["src/server.js"]],
    ["bun run src/index.ts", ["src/index.ts"]],
    ["bun src/index.ts", ["src/index.ts"]],
    ["nodemon src/index.js", ["src/index.js"]],
    ["nodemon --watch src --ext ts --exec ts-node src/index.ts", ["src/index.ts"]],
    ['nodemon --exec "ts-node src/app.ts"', ["src/app.ts"]],
    [
      "node --import tsx --test test/a.test.ts test/b.test.ts",
      ["test/a.test.ts", "test/b.test.ts"],
    ],
    ["node --test test/*.test.ts", ["test/*.test.ts"]],
    ["tsc -p tsconfig.json && node dist/main.js", ["dist/main.js"]],
    ["dotenv -e .env.local -- node dist/server.js", ["dist/server.js"]],
    ["node -- dist/server.js", ["dist/server.js"]],
    ["./node_modules/.bin/tsx src/a.ts", ["src/a.ts"]],
    ["node.exe dist/a.js", ["dist/a.js"]],
  ])("%s runs %j", (script, files) => {
    expect(scriptFiles(script)).toEqual(files);
  });

  it.each([
    "tsc -p tsconfig.json",
    "vite build",
    "npm run build",
    "pnpm -r build",
    "jest",
    'node -e "console.log(1)"',
    "node -p 1+1",
    "node --run build",
    "node",
    "tsup src/index.ts --format esm",
    "babel src --out-dir dist",
    "node -",
  ])("%s runs no file", (script) => {
    expect(scriptFiles(script)).toEqual([]);
  });
});
