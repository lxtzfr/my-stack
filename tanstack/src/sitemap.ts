import type { SiteResolver } from './siteResolver.js'

export interface SitemapOptions<TSite> {
  /** Absolute or root-relative paths (e.g. "/", "/about") for this site — undefined/null for a 404 (e.g. an unconfigured domain). `origin` is the request's own scheme+host, handy for building the same URLs elsewhere. */
  urls: (site: TSite, origin: string) => string[] | undefined | null
}

// A route handler matching TanStack Start's raw-route shape — pass this
// into `createFileRoute('/sitemap.xml')(createSitemapRoute(...))`.
export function createSitemapRoute<TSite>(resolver: SiteResolver<TSite>, options: SitemapOptions<TSite>) {
  return {
    server: {
      handlers: {
        GET: ({ request }: { request: Request }) => {
          const host = request.headers.get('host') ?? ''
          const site = resolver.resolveForRequest(request)
          const origin = `https://${host.split(':')[0]}`
          const urls = options.urls(site, origin)
          if (!urls) return new Response('Not found', { status: 404 })
          const body =
            '<?xml version="1.0" encoding="UTF-8"?>\n' +
            '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
            urls.map((path) => `  <url><loc>${path.startsWith('http') ? path : origin + path}</loc></url>\n`).join('') +
            '</urlset>\n'
          return new Response(body, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } })
        },
      },
    },
  }
}
