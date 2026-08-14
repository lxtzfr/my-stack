// Works for either a single-domain or a multi-domain app — the shape is the
// same either way, no separate API to learn: pass one `TSite` (single
// domain) or a `Record<domain, TSite>` (multi-domain). Deliberately doesn't
// try to auto-detect which one you passed (a config object and a domain map
// are both plain objects, indistinguishable at runtime) — you always say
// which mode you're in by which factory you call.

export interface CreateSiteResolverOptions<TSite> {
  /** Domain (lowercase, no port, no leading "www.") -> site. */
  sites: Record<string, TSite>
  /** Used when the request's host doesn't match any configured domain. */
  defaultSite: TSite
  /** Cookie name for the local-dev "view as another domain" override. */
  devOverrideCookieName?: string
  /** Which hosts count as "local dev" (where the override applies at all) — never honored on any other host, so it can't be used to spoof a domain in production. */
  isLocalHost?: (host: string) => boolean
}

export interface SiteResolver<TSite> {
  /** Pure host -> site lookup, no dev-override support — for contexts with only a domain string. */
  resolveForHost(host: string): TSite
  /** Full resolution including the local-dev override cookie — for raw Request-based handlers (e.g. a GET route handler). */
  resolveForRequest(request: Request): TSite
  /** Whether the override is honored at all for this host — same check `resolveForRequest` uses internally, exposed so other entry points (e.g. siteConfigServerFn.ts's query-param override) can apply the exact same guard instead of re-deriving it. */
  isOverrideAllowedForHost(host: string): boolean
  readonly devOverrideCookieName: string
}

function normalizeDomain(host: string): string {
  return host.split(':')[0].toLowerCase().replace(/^www\./, '')
}

const DEFAULT_LOCAL_HOST_RE = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i

function parseCookieHeader(header: string | null, name: string): string | undefined {
  if (!header) return undefined
  for (const part of header.split(';')) {
    const eq = part.indexOf('=')
    if (eq === -1) continue
    if (part.slice(0, eq).trim() === name) return decodeURIComponent(part.slice(eq + 1).trim())
  }
  return undefined
}

export function createSiteResolver<TSite>(options: CreateSiteResolverOptions<TSite>): SiteResolver<TSite> {
  const devOverrideCookieName = options.devOverrideCookieName ?? '__site'
  const isLocalHost = options.isLocalHost ?? ((host) => DEFAULT_LOCAL_HOST_RE.test(host))

  function resolveForHost(host: string): TSite {
    return options.sites[normalizeDomain(host)] ?? options.defaultSite
  }

  function resolveForRequest(request: Request): TSite {
    const host = request.headers.get('host') ?? ''
    if (!isLocalHost(host)) return resolveForHost(host)
    const override = parseCookieHeader(request.headers.get('cookie'), devOverrideCookieName)
    return resolveForHost(override ?? host)
  }

  return { resolveForHost, resolveForRequest, isOverrideAllowedForHost: isLocalHost, devOverrideCookieName }
}

/** Single-domain convenience — always returns the same site, no host/cookie logic at all. */
export function createSingleSiteResolver<TSite>(site: TSite): SiteResolver<TSite> {
  return {
    resolveForHost: () => site,
    resolveForRequest: () => site,
    isOverrideAllowedForHost: () => false,
    devOverrideCookieName: '',
  }
}
