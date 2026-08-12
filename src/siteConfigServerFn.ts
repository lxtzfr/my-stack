import { getCookie, getRequestHost, getRequestUrl, setCookie } from '@tanstack/react-start/server'
import type { SiteResolver } from './siteResolver.js'

export interface ResolveSiteWithDevOverrideOptions {
  /** Query param that triggers the override on a local-dev host, e.g. `?__site=other.com`. */
  queryParam?: string
}

// Deliberately NOT wrapped in `createServerFn` here — TanStack Start's
// server-function support works via a build-time compiler plugin that
// splits client/server code, and that plugin only scans your own app's
// source files, not pre-built code sitting in node_modules. A
// `createServerFn(...).handler(...)` call shipped inside a library never
// gets picked up by that transform, so calling it silently breaks (the
// request context — cookies, host — never gets wired up). The fix: this
// function has the actual logic, and *your app* wraps it in its own
// `createServerFn` call, in your own source, where the compiler can see it:
//
//   import { createServerFn } from '@tanstack/react-start'
//   import { resolveSiteWithDevOverride } from 'kit-web'
//
//   export const getSiteConfig = createServerFn({ method: 'GET' }).handler(
//     (): SiteConfig => resolveSiteWithDevOverride(siteResolver),
//   )
//
// Resolves the current site from the request's host, honoring the
// local-dev-only `?<queryParam>=<domain>` override (stashed in a cookie so
// it survives requests that don't carry the query param, like a router
// loader revalidation) — ignored entirely on any non-local host, so it can
// never be used to spoof a domain in production. See SiteResolver's own
// `isOverrideAllowedForHost`.
export function resolveSiteWithDevOverride<TSite>(
  resolver: SiteResolver<TSite>,
  options: ResolveSiteWithDevOverrideOptions = {},
): TSite {
  const queryParam = options.queryParam ?? '__site'
  const cookieName = resolver.devOverrideCookieName
  const host = getRequestHost() ?? ''
  if (!cookieName || !resolver.isOverrideAllowedForHost(host)) return resolver.resolveForHost(host)

  const queryOverride = getRequestUrl().searchParams.get(queryParam)
  if (queryOverride) setCookie(cookieName, queryOverride, { path: '/' })
  const override = queryOverride ?? getCookie(cookieName)
  return resolver.resolveForHost(override ?? host)
}
