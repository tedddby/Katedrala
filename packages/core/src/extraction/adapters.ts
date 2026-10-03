/**
 * Adapter lifecycle helpers shared by extraction and project preparation.
 */
import type { LanguageAdapter } from "@katedrala/plugin-api";

const initializations = new WeakMap<LanguageAdapter, Promise<void>>();

/**
 * Run `adapter.init()` at most once per adapter instance (extraction and project preparation share the
 * result, including a failure, which is returned again on every call). Adapters without `init` resolve
 * immediately.
 */
export function initializeAdapter(adapter: LanguageAdapter): Promise<void> {
  let initialization = initializations.get(adapter);
  if (initialization === undefined) {
    // An async wrapper turns a synchronous throw into a rejection.
    initialization = (async (): Promise<void> => {
      await adapter.init?.();
    })();
    initializations.set(adapter, initialization);
  }
  return initialization;
}
