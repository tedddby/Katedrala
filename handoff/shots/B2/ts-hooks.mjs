// Lets Node (type stripping) import the site's pure TypeScript modules: relative specifiers without an extension
// and the "@/" alias resolve as the site's bundler resolves them.
import { registerHooks } from "node:module";
import { pathToFileURL } from "node:url";

const SITE = "/home/user/Katedrala/site";
registerHooks({
  resolve(specifier, context, next) {
    let spec = specifier;
    if (spec.startsWith("@/")) spec = pathToFileURL(`${SITE}/${spec.slice(2)}`).href;
    try {
      return next(spec, context);
    } catch (error) {
      if (/^(\.{1,2}\/|file:)/.test(spec)) {
        for (const ext of [".ts", ".tsx", "/index.ts"]) {
          try {
            return next(spec + ext, context);
          } catch {
            // try the next extension
          }
        }
      }
      throw error;
    }
  },
});
