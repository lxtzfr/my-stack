import { createGlobalSingleton } from './globalSingleton.js'

// Generic in-process pub/sub so any server module can broadcast to whoever
// is currently listening on an SSE endpoint without that route needing to
// know about every channel up front — a module just publishes on a channel
// name, and the stream re-sends it to clients subscribed to that same
// channel.
type Listener<T> = (payload: T) => void

function subscribers(): Map<string, Set<Listener<unknown>>> {
  return createGlobalSingleton('__kitWebEventBusSubscribers', () => new Map<string, Set<Listener<unknown>>>())
}

export function publish<T>(channel: string, payload: T): void {
  const listeners = subscribers().get(channel)
  if (!listeners) return
  for (const listener of listeners) listener(payload)
}

export function subscribe<T>(channel: string, listener: Listener<T>): () => void {
  const map = subscribers()
  const set = map.get(channel) ?? new Set()
  map.set(channel, set)
  set.add(listener as Listener<unknown>)
  return () => set.delete(listener as Listener<unknown>)
}
