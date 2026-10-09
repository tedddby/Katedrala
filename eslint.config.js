// @ts-check
import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import { defineConfig, globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";

/** Locale-dependent methods (an esquery regular expression on property names). */
const LOCALE_METHODS = "/^(?:localeCompare|toLocaleLowerCase|toLocaleUpperCase|toLocaleString)$/";

/** Module restrictions of @katedrala/inference (plan 2.1), for the base rule and its TypeScript extension. */
const INFERENCE_RESTRICTED_IMPORTS = {
  paths: [
    ...["fs", "path", "os", "crypto", "url", "util", "worker_threads"].map((name) => ({
      name,
      message: "Inference runs in any JavaScript environment: no Node.js modules (ADR-013).",
    })),
    {
      name: "zod",
      message:
        "The engine validates the inference configuration; inference takes resolved settings.",
    },
    {
      name: "picomatch",
      message: "The engine resolves configured globs to files; inference takes file lists.",
    },
  ],
  patterns: [
    {
      group: [
        "node:*",
        "fs/*",
        "path/*",
        "os/*",
        "crypto/*",
        "url/*",
        "util/*",
        "worker_threads/*",
      ],
      message: "Inference runs in any JavaScript environment: no Node.js modules (ADR-013).",
    },
    {
      group: ["zod/*", "picomatch/*"],
      message:
        "The engine validates configuration and resolves globs; inference takes resolved inputs.",
    },
    {
      // Every workspace package other than ir, graph and model, including packages added later.
      regex: "^@katedrala/(?!(?:ir|graph|model)(?:/|$))",
      message:
        "@katedrala/inference depends on @katedrala/ir, @katedrala/graph and @katedrala/model only (docs/ARCHITECTURE.md, Packages).",
    },
  ],
};

export default defineConfig([
  globalIgnores([
    "**/node_modules/**",
    "**/dist/**",
    "coverage/**",
    "fixtures/**",
    "packages/ir/schema/**",
    "benchmarks/.work/**",
    "benchmarks/results/**",
    // The website is a separate Next.js workspace with its own toolchain; it is type-checked by its own build.
    "site/**",
  ]),
  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "separate-type-imports" },
      ],
      "@typescript-eslint/no-import-type-side-effects": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none" },
      ],
      "@typescript-eslint/restrict-template-expressions": [
        "error",
        { allowNumber: true, allowBoolean: true },
      ],
      "@typescript-eslint/switch-exhaustiveness-check": "error",
      "@typescript-eslint/no-unnecessary-condition": [
        "error",
        { allowConstantLoopConditions: true },
      ],
      "no-console": "error",
      eqeqeq: ["error", "always", { null: "ignore" }],
      "prefer-const": "error",
    },
  },
  {
    // Tests may use non-null assertions on values they have just asserted.
    files: ["**/*.test.ts", "tests/**/*.ts"],
    rules: {
      "@typescript-eslint/no-non-null-assertion": "off",
    },
  },
  {
    // Numeric kernels index typed arrays inside loops whose bounds guarantee validity. Under
    // `noUncheckedIndexedAccess` every such read is `number | undefined`; non-null assertions are the
    // zero-cost way to state the invariant. Keep this list to genuinely numeric code.
    files: [
      "packages/ir/src/hash.ts",
      "packages/graph/src/**/*.ts",
      "packages/inference/src/{weighted-graph,directories}.ts",
      "packages/inference/src/modules/{prior,stems,classes,split,reassign,confidence}.ts",
      "packages/inference/src/layers/{order,explain}.ts",
    ],
    rules: {
      "@typescript-eslint/no-non-null-assertion": "off",
    },
  },
  {
    // @katedrala/inference is a pure library over the IR: it depends on ir, graph and model only, uses no
    // Node.js API, and nothing that reads the clock, randomness or the locale (docs/ARCHITECTURE.md,
    // ADR-013). `tsconfig.base.json` includes Node.js types everywhere, so lint enforces this. Tests and
    // test support may use Node.js and other workspace packages.
    files: ["packages/inference/src/**/*.ts"],
    ignores: ["**/*.test.ts", "**/*test-support.ts"],
    rules: {
      "no-restricted-imports": ["error", INFERENCE_RESTRICTED_IMPORTS],
      "@typescript-eslint/no-restricted-imports": ["error", INFERENCE_RESTRICTED_IMPORTS],
      "no-restricted-globals": [
        "error",
        ...["process", "Buffer", "__dirname"].map((name) => ({
          name,
          message: "Inference runs in any JavaScript environment: no Node.js globals (ADR-013).",
        })),
        {
          name: "Intl",
          message:
            "Locale-dependent formatting is not deterministic; use toFixed and compareStrings.",
        },
      ],
      "no-restricted-properties": [
        "error",
        {
          object: "Math",
          property: "random",
          message:
            "Inference is deterministic: no randomness (use a seeded createRandom in tests).",
        },
        {
          object: "Date",
          property: "now",
          message: "Inference is deterministic: the clock is not an input.",
        },
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector: `MemberExpression[property.name=${LOCALE_METHODS}]`,
          message:
            "Locale-dependent string operations are not deterministic: compare with compareStrings, fold case with asciiLower, format with toFixed (D-05).",
        },
        {
          selector: `MemberExpression[computed=true][property.value=${LOCALE_METHODS}]`,
          message:
            "Locale-dependent string operations are not deterministic: compare with compareStrings, fold case with asciiLower, format with toFixed (D-05).",
        },
        {
          selector: "NewExpression[callee.name='Date'][arguments.length=0]",
          message: "Inference is deterministic: the clock is not an input.",
        },
      ],
    },
  },
  {
    // Plain JavaScript (configs and scripts) is not type-checked.
    files: ["**/*.js", "**/*.mjs", "**/*.cjs"],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: {
      globals: {
        process: "readonly",
        console: "readonly",
        URL: "readonly",
        structuredClone: "readonly",
      },
    },
    rules: {
      "no-console": "off",
    },
  },
  prettier,
]);
