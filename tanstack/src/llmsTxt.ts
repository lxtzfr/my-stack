import type { SiteResolver } from './siteResolver.js'

export interface LlmsTxtOptions<TSite> {
  /** Full markdown body for this site, or undefined/null for a 404 (e.g. an unconfigured domain). */
  content: (site: TSite) => string | undefined | null
}

// A route handler matching TanStack Start's raw-route shape
// (`{ server: { handlers: { GET } } }`) — pass this straight into
// `createFileRoute('/llms.txt')(createLlmsTxtRoute(...))`.
//
// llmstxt.org convention: a plain-markdown summary for LLMs/AI crawlers.
// Link lines in your content must use markdown link syntax `[label](url)`,
// not `label: url` — the llmstxt.org validator specifically checks for that
// syntax under a "## Links" heading and reports "file doesn't contain
// links" otherwise, even when a URL is right there in plain text.
export function createLlmsTxtRoute<TSite>(resolver: SiteResolver<TSite>, options: LlmsTxtOptions<TSite>) {
  return {
    server: {
      handlers: {
        GET: ({ request }: { request: Request }) => {
          const site = resolver.resolveForRequest(request)
          const body = options.content(site)
          if (!body) return new Response('Not found', { status: 404 })
          return new Response(body, { headers: { 'Content-Type': 'text/markdown; charset=utf-8' } })
        },
      },
    },
  }
}
