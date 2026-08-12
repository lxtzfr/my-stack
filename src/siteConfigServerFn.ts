import { createServerFn } from '@tanstack/react-start'
import { getCookie, getRequestHost, getRequestUrl, setCookie } from '@tanstack/react-start/server'
import type { SiteResolver } from './siteResolver.js'

export interface SiteConfigServerFnOptions {
  /** Query param that triggers the override on a local-dev host, e.g. `?__site=other.com`. */
  queryParam?: string
}

// Client-callable resolution of the current site, with a local-dev-only
// escape hatch: visiting `?<queryParam>=<domain>` on a local host stashes
// that domain in a cookie (so it survives requests that don't carry the
// query param, like a router loader revalidation), letting you preview any
// configured domain without touching your hosts file. Ignored entirely on
// any non-local host, so it can never be used to spoof a domain in
// production — see SiteResolver's own `isOverrideAllowedForHost` check.
export function createSiteConfigServerFn<TSite>(resolver: SiteResolver<TSite>, options: SiteConfigServerFnOptions = {}) {
  const queryParam = options.queryParam ?? '__site'
  const cookieName = resolver.devOverrideCookieName

  function resolve(): TSite {
    const host = getRequestHost() ?? ''
    if (!cookieName || !resolver.isOverrideAllowedForHost(host)) return resolver.resolveForHost(host)

    const queryOverride = getRequestUrl().searchParams.get(queryParam)
    if (queryOverride) setCookie(cookieName, queryOverride, { path: '/' })
    const override = queryOverride ?? getCookie(cookieName)
    return resolver.resolveForHost(override ?? host)
  }

  // `createServerFn`'s return type is validated against a "serializable"
  // conditional type that a generic, unconstrained `TSite` can't resolve
  // through — it works fine once a caller instantiates this with a concrete
  // site type (that's the whole point of the generic), so the casts below
  // are just working around TypeScript's inference giving up on the generic
  // case, not hiding a real type error. This function's own declared return
  // type keeps callers of the factory fully typed regardless.
  const serverFn = createServerFn({ method: 'GET' }).handler(resolve as any)
  return serverFn as unknown as () => Promise<TSite>
}
