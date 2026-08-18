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
  /** Which hosts count as "local dev" (where the override applies at all) — never honored on any other host, so it can't be used to spoof a domain in production. Defaults to loopback, plus private/link-local network addresses when NODE_ENV isn't "production" (see isDefaultLocalHost). */
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

const LOOPBACK_HOST_RE = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i
// The machine running the dev server, reached from another device on the
// same network — a phone opening http://192.168.1.20:3000 to try the real
// touch gestures. Loopback alone doesn't cover it, and without this the
// override is silently ignored there: the site quietly resolves to the
// default one and nothing says why.
//
// The private IPv4 ranges (RFC 1918), link-local (RFC 3927, what a network
// hands out when there's no DHCP), shared address space (RFC 6598, which is
// what a Tailscale/CGNAT address looks like — reaching the dev server over a
// tailnet is the same case as reaching it over the LAN), their IPv6
// equivalents — unique-local fc00::/7 and link-local fe80::/10 — and mDNS
// `.local` names. Split rather than crammed into one alternation so each
// range stays readable, and so `.local` can be anchored to the end of the
// host (with or without a port): unanchored it would also match
// `evil.localdomain.com`.
const PRIVATE_IPV4_RE =
  /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.)/
const PRIVATE_IPV6_RE = /^\[?(f[cd][0-9a-f]{2}|fe[89ab][0-9a-f])[:.]/i
const MDNS_HOST_RE = /\.local(:\d+)?$/i

// Honored only outside production. The override lets a caller pick which
// site renders, and the Host header is attacker-controlled — on a public
// server "looks like a LAN address" proves nothing about who is asking, so
// the widened check has to stay off there. Loopback stays allowed either
// way: a request can't reach a remote host while claiming to come from that
// host's own loopback.
function isDefaultLocalHost(host: string): boolean {
  if (LOOPBACK_HOST_RE.test(host)) return true
  if (globalThis.process?.env?.NODE_ENV === 'production') return false
  return PRIVATE_IPV4_RE.test(host) || PRIVATE_IPV6_RE.test(host) || MDNS_HOST_RE.test(host)
}

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
  const isLocalHost = options.isLocalHost ?? isDefaultLocalHost

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
