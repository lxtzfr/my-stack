// Server route handlers and server functions get bundled into their own
// chunk by Vite/Nitro, so a plain module-level variable gives each chunk
// its own private copy instead of one shared value — globalThis is the one
// thing guaranteed to be the same object across every chunk in the same
// process. This same problem (and fix) was previously hand-rolled
// separately for an in-process event bus and a rate-limit cooldown map;
// generalized here so every "one instance per process" need (a pub/sub
// subscriber map, a DB client, a cooldown map) shares one implementation.
export function createGlobalSingleton<T>(key: string, factory: () => T): T {
  const g = globalThis as typeof globalThis & Record<string, unknown>
  if (g[key] === undefined) g[key] = factory()
  return g[key] as T
}
