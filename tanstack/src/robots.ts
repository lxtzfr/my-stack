import type { SiteResolver } from './siteResolver.js'

export interface RobotsOptions<TSite> {
  /** Paths to disallow for this site — empty/omitted means "Allow: /". `undefined`/`null` means "not a configured site" (still returns a bare "Allow: /" with no sitemap link, matching robots.txt convention of never 404ing). */
  disallow?: (site: TSite) => string[] | undefined | null
  /** Whether to include a `Sitemap:` line pointing at `/sitemap.xml` on the same host — defaults to true. */
  includeSitemap?: boolean
}

// A route handler matching TanStack Start's raw-route shape — pass this
// into `createFileRoute('/robots.txt')(createRobotsRoute(...))`.
export function createRobotsRoute<TSite>(resolver: SiteResolver<TSite>, options: RobotsOptions<TSite> = {}) {
  return {
    server: {
      handlers: {
        GET: ({ request }: { request: Request }) => {
          const host = request.headers.get('host') ?? ''
          const site = resolver.resolveForRequest(request)
          const disallow = options.disallow?.(site) ?? []
          const lines = ['User-agent: *', ...(disallow.length === 0 ? ['Allow: /'] : disallow.map((path) => `Disallow: ${path}`))]
          if (options.includeSitemap ?? true) {
            lines.push('', `Sitemap: https://${host.split(':')[0]}/sitemap.xml`)
          }
          return new Response(lines.join('\n') + '\n', { headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
        },
      },
    },
  }
}
