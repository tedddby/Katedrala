/**
 * Files run by `package.json` scripts (`"start": "node dist/server.js"`), recognized statically.
 *
 * A script is split into commands at unquoted `&&`, `||`, `;`, `|`, `&` and line breaks. In each command,
 * leading environment assignments (`NODE_ENV=production`) and wrappers (`cross-env`, `env`, `npx`, `pnpx`,
 * `bunx`, `dotenv ... --`, `pnpm exec`, `pnpm dlx`, `yarn exec`, `yarn dlx`, `npm exec`) are skipped. When
 * the command is a JavaScript runner — `node`, `ts-node` (and `ts-node-esm`, `ts-node-dev`, `tsnd`),
 * `tsx` (also `tsx watch`), `babel-node`, `nodemon` or `bun` (also `bun run`) — its first positional
 * argument after the runner's options is the file it runs (`node --test` runs every positional argument;
 * `nodemon --exec <command>` is analyzed recursively). Evaluated code (`node -e`) runs no file.
 */

/** Runner name → options that take a separate value argument. */
const RUNNER_OPTIONS_WITH_VALUES: Readonly<Record<string, ReadonlySet<string>>> = {
  node: new Set([
    "-r",
    "--require",
    "--import",
    "--loader",
    "--experimental-loader",
    "-C",
    "--conditions",
    "--env-file",
    "--env-file-if-exists",
    "--input-type",
    "--inspect-port",
    "--title",
    "--watch-path",
    "--test-name-pattern",
    "--test-skip-pattern",
    "--test-reporter",
    "--test-reporter-destination",
    "--test-concurrency",
    "--test-shard",
    "--redirect-warnings",
    "--diagnostic-dir",
    "--report-dir",
    "--report-directory",
    "--report-filename",
    "--cpu-prof-dir",
    "--heap-prof-dir",
    "--stack-size",
  ]),
  "ts-node": new Set([
    "-r",
    "--require",
    "-P",
    "--project",
    "-O",
    "--compilerOptions",
    "--compiler-options",
    "-C",
    "--compiler",
    "-I",
    "--ignore",
    "-D",
    "--ignoreDiagnostics",
    "--ignore-diagnostics",
    "--cwd",
    "--dir",
    "--scope-dir",
    "--scopeDir",
  ]),
  "ts-node-dev": new Set([
    "-r",
    "--require",
    "-P",
    "--project",
    "-O",
    "--compiler-options",
    "-C",
    "--compiler",
    "--ignore-watch",
    "--watch",
    "--interval",
    "--debounce",
    "--dir",
    "--cwd",
  ]),
  tsx: new Set([
    "--tsconfig",
    "--env-file",
    "--import",
    "-r",
    "--require",
    "-C",
    "--conditions",
    "--include",
    "--exclude",
  ]),
  "babel-node": new Set([
    "--presets",
    "--plugins",
    "-x",
    "--extensions",
    "--config-file",
    "--root-mode",
    "--env-name",
    "-i",
    "--ignore",
    "-o",
    "--only",
  ]),
  nodemon: new Set([
    "-w",
    "--watch",
    "-e",
    "--ext",
    "-i",
    "--ignore",
    "-d",
    "--delay",
    "-s",
    "--signal",
    "--config",
    "--cwd",
  ]),
  bun: new Set(["-r", "--preload", "--env-file", "--cwd", "-c", "--config", "--tsconfig-override"]),
};

const RUNNER_ALIASES: Readonly<Record<string, string>> = {
  node: "node",
  nodejs: "node",
  "ts-node": "ts-node",
  "ts-node-esm": "ts-node",
  "ts-node-dev": "ts-node-dev",
  tsnd: "ts-node-dev",
  tsx: "tsx",
  "babel-node": "babel-node",
  nodemon: "nodemon",
  bun: "bun",
};

const EVAL = ["-e", "--eval", "-p", "--print"];

/** Runner name → options that evaluate code or start a REPL instead of running a file. */
const RUNNER_EVAL_OPTIONS: Readonly<Record<string, ReadonlySet<string>>> = {
  node: new Set([...EVAL, "-i", "--interactive"]),
  "ts-node": new Set([...EVAL, "-i", "--interactive"]),
  tsx: new Set(EVAL),
  "babel-node": new Set(EVAL),
  bun: new Set(EVAL),
};

const SINGLE_WRAPPERS = new Set(["cross-env", "cross-env-shell", "env", "npx", "pnpx", "bunx"]);
const DOUBLE_WRAPPERS = new Set(["pnpm exec", "pnpm dlx", "yarn exec", "yarn dlx", "npm exec"]);
const ENVIRONMENT_ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;

/**
 * Split a script into commands and tokenize them. Single and double quotes group text; a backslash
 * escapes a following quote, space or backslash (elsewhere it is kept, as in Windows paths).
 */
export function tokenizeScript(script: string): string[][] {
  const commands: string[][] = [];
  let tokens: string[] = [];
  let current = "";
  let inToken = false;
  let quote: string | undefined;
  const endToken = (): void => {
    if (inToken) tokens.push(current);
    current = "";
    inToken = false;
  };
  const endCommand = (): void => {
    endToken();
    if (tokens.length > 0) commands.push(tokens);
    tokens = [];
  };
  for (let index = 0; index < script.length; index++) {
    const character = script[index] ?? "";
    if (quote !== undefined) {
      if (character === quote) {
        quote = undefined;
      } else if (character === "\\" && quote === '"' && index + 1 < script.length) {
        current += script[index + 1] ?? "";
        index++;
      } else {
        current += character;
      }
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      inToken = true;
    } else if (character === "\\" && /^["'\\ ]$/.test(script[index + 1] ?? "")) {
      current += script[index + 1] ?? "";
      inToken = true;
      index++;
    } else if (character === " " || character === "\t") {
      endToken();
    } else if (character === "\n" || character === "\r" || character === ";") {
      endCommand();
    } else if (character === "&" || character === "|") {
      endCommand();
      if (script[index + 1] === character) index++;
    } else {
      current += character;
      inToken = true;
    }
  }
  endCommand();
  return commands;
}

function runnerOf(token: string): string | undefined {
  const name = (token.split(/[\\/]/).pop() ?? token).replace(/\.(?:cmd|exe)$/i, "");
  return RUNNER_ALIASES[name];
}

function skipWrappers(tokens: readonly string[]): number {
  let index = 0;
  while (index < tokens.length) {
    const token = tokens[index] ?? "";
    const pair = `${token} ${tokens[index + 1] ?? ""}`;
    if (ENVIRONMENT_ASSIGNMENT.test(token)) {
      index++;
    } else if (DOUBLE_WRAPPERS.has(pair)) {
      index += 2;
    } else if (SINGLE_WRAPPERS.has(token)) {
      index++;
      while (index < tokens.length && (tokens[index] ?? "").startsWith("-")) index++;
    } else if (token === "dotenv" || token === "dotenv-cli") {
      const separator = tokens.indexOf("--", index);
      if (separator === -1) return tokens.length;
      index = separator + 1;
    } else {
      break;
    }
  }
  return index;
}

/** Files (as written) that one tokenized command runs. */
function commandFiles(tokens: readonly string[], depth: number): string[] {
  if (depth > 4) return [];
  let index = skipWrappers(tokens);
  const runner = runnerOf(tokens[index] ?? "");
  if (runner === undefined) return [];
  index++;
  if (runner === "tsx" && tokens[index] === "watch") index++;
  if (runner === "bun" && tokens[index] === "run") index++;
  const withValues = RUNNER_OPTIONS_WITH_VALUES[runner] ?? new Set<string>();
  const evaluates = RUNNER_EVAL_OPTIONS[runner] ?? new Set<string>();
  const files: string[] = [];
  let testMode = false;
  while (index < tokens.length) {
    const token = tokens[index] ?? "";
    if (token === "--") {
      const file = tokens[index + 1];
      if (file !== undefined) files.push(file);
      break;
    }
    if (token.startsWith("-") && token !== "-") {
      const option = token.includes("=") ? token.slice(0, token.indexOf("=")) : token;
      if (evaluates.has(option)) return files;
      if (runner === "node" && option === "--test") testMode = true;
      if (runner === "node" && option === "--run") return files;
      if (runner === "nodemon" && (option === "-x" || option === "--exec")) {
        const command = token.includes("=")
          ? token.slice(token.indexOf("=") + 1)
          : tokens[index + 1];
        if (command !== undefined) {
          for (const nested of tokenizeScript(command))
            files.push(...commandFiles(nested, depth + 1));
        }
        index += token.includes("=") ? 1 : 2;
        continue;
      }
      index += !token.includes("=") && withValues.has(option) ? 2 : 1;
      continue;
    }
    if (token !== "-") files.push(token);
    if (!testMode) break;
    index++;
  }
  return files;
}

/**
 * The files a `package.json` script runs, as written (relative to the package directory), in order of
 * appearance. Glob patterns are returned as written; callers skip them.
 */
export function scriptFiles(script: string): string[] {
  return tokenizeScript(script).flatMap((tokens) => commandFiles(tokens, 0));
}
