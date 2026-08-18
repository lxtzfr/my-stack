import { AsyncLocalStorage } from 'node:async_hooks'
import { randomBytes } from 'node:crypto'

export interface RequestContext {
  requestId: string
}

/** One instance per process — shared via `createGlobalSingleton`-style
 *  module caching isn't needed here since `AsyncLocalStorage` itself has
 *  no per-chunk state problem, unlike the TanStack kit's `globalSingleton`. */
export const requestContext = new AsyncLocalStorage<RequestContext>()

export function getRequestId(): string {
  return requestContext.getStore()?.requestId ?? '-'
}

export function generateRequestId(): string {
  return randomBytes(4).toString('hex')
}
