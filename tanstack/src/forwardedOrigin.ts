// Every app here sits behind Traefik, which terminates TLS and proxies to the container over
// plain HTTP — so a raw incoming Request's own `.url` is always `http://`, whatever the visitor
// actually used. Anything that derives an absolute URL from `request.url` (redirect_uri for an
// OAuth flow, a `Secure`-cookie decision, a canonical `<link>` tag...) gets it wrong unless it's
// told to trust Traefik's `X-Forwarded-Proto`/`X-Forwarded-Host` headers instead.
//
// Nitro's own server (srvx) *can* do this rewrite itself, but only via a `trustProxy` option that
// Nitro doesn't currently expose a way to set — so this does the same rewrite by hand, for
// call sites (like @auth/core's `Auth()`) that read `request.url` directly and have no forwarded-
// header support of their own to opt into.

export interface ForwardedOrigin {
  proto?: 'http' | 'https'
  host?: string
}

/** Parses the standard forwarded-proxy headers Traefik sets. First value only — a chain of
 *  proxies would comma-join them, but there's exactly one hop (Traefik -> this container) here.
 *  A WebSocket upgrade gets `wss`/`ws` here (matching the scheme the browser actually connected
 *  with) rather than `https`/`http` — folded into their HTTP equivalents below, since this is
 *  about whether the underlying connection was actually secure, not literally about HTTP vs WS. */
export function forwardedOrigin(headers: Headers): ForwardedOrigin {
  const rawProto = headers.get('x-forwarded-proto')?.split(',')[0]?.trim()
  const proto = rawProto === 'wss' ? 'https' : rawProto === 'ws' ? 'http' : rawProto
  const host = headers.get('x-forwarded-host')?.split(',')[0]?.trim()
  return { proto: proto === 'http' || proto === 'https' ? proto : undefined, host }
}

/** Rewrites `request.url` in place to the origin Traefik says the visitor actually used, so
 *  anything reading `request.url` downstream (framework or library code you don't control) sees
 *  the real scheme/host instead of the proxy's plain-HTTP one. No-op if neither forwarded header
 *  is present (e.g. a direct local request, not behind Traefik at all). */
export function withForwardedOrigin(request: Request): Request {
  const { proto, host } = forwardedOrigin(request.headers)
  if (!proto && !host) return request
  const url = new URL(request.url)
  if (proto) url.protocol = `${proto}:`
  if (host) url.host = host
  Object.defineProperty(request, 'url', { value: url.href, enumerable: true, configurable: true })
  return request
}
