/**
 * What the server computes for Acts II, III and the landing and hands to the browser with the page (Film.tsx passes
 * it to the film's client island; each act reads it as ActContext.payload). Keep it small and serializable: the
 * evidence object, never the graph (the browser fetches that once, for the model).
 *
 * Typed stub, written at G1 by the film's engine; the acts' builder owns this file from here on.
 */
export type ActPayload = Readonly<Record<string, never>>;

export function actPayload(): ActPayload {
  return {};
}
