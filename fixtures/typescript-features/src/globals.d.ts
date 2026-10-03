/** Version string injected by the bundler (tsup `define`). */
declare const __APP_VERSION__: string;

/** Feature flags the host page may set before the bundle loads. */
declare var __SHOP_FLAGS__: Readonly<Record<string, boolean>> | undefined;

declare namespace ShopGlobals {
  interface BuildInfo {
    version: string;
    commit: string;
    builtAt: string;
  }

  function buildInfo(): BuildInfo;
}
