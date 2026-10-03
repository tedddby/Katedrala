// Runtime shims for older embedded browsers. Imported once, for its side effects, by shop.ts.
if (typeof Array.prototype.at !== "function") {
  Object.defineProperty(Array.prototype, "at", {
    configurable: true,
    writable: true,
    value: function at(this: unknown[], index: number): unknown {
      const i = Math.trunc(index) || 0;
      return this[i < 0 ? this.length + i : i];
    },
  });
}
