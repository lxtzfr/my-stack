# kit-web

Generic site utilities for TanStack Start — works for a single-domain app
or a multi-domain one with the same API. No business logic, no assumptions
about what your site is about: you always supply your own `TSite` config
and content.

## What's in here

- **`createSiteResolver` / `createSingleSiteResolver`** — host → site
  resolution, with an optional local-dev "view as another domain" cookie
  override (never honored outside local hosts, so it can't be used to spoof
  a domain in production).
- **`resolveSiteWithDevOverride`** — the logic behind a client-callable "get
  current site" server function, with a `?__site=` query-param escape hatch
  on local hosts (stashed in a cookie so it survives loader revalidations).
  **Not** wrapped in `createServerFn` itself — see the note on that function
  for why (TanStack Start's server-function compiler only scans your app's
  own source, not code inside `node_modules`) — you wrap it in your own
  `createServerFn` call:
  ```ts
  import { createServerFn } from '@tanstack/react-start'
  import { resolveSiteWithDevOverride } from 'kit-web'

  export const getSiteConfig = createServerFn({ method: 'GET' }).handler(
    (): MySite => resolveSiteWithDevOverride(resolver),
  )
  ```
- **`createLlmsTxtRoute`** — an [llms.txt](https://llmstxt.org) route
  handler factory.
- **`createSitemapRoute`** — a `sitemap.xml` route handler factory.
- **`createRobotsRoute`** — a `robots.txt` route handler factory.
- **`buildHeadMeta`** — title/description/OG/Twitter `<head>` tag builder.
- **`createGlobalSingleton`** — `globalThis`-backed memoization for "one
  instance per process" state (an event bus, a DB client...) — needed
  because Vite/Nitro bundle route handlers and server functions into
  separate chunks, so a plain module-level variable would give each chunk
  its own private copy instead of sharing one.
- **`publish` / `subscribe`** — generic in-process pub/sub (built on
  `createGlobalSingleton`), for broadcasting to an SSE endpoint without
  that route needing to know about every channel up front.
- **`RUNTIME_DATA_DIR`** — where runtime-writable state persists across
  redeploys (`process.env.DATA_DIR`, falling back to `./data` locally).
- **`createSqlitePrismaClient`** — Prisma + SQLite bootstrap via
  `@prisma/adapter-libsql` (works unmodified on Alpine/musl — no native
  query-engine binary), memoized with `createGlobalSingleton`. Takes your
  own generated `PrismaClient` constructor — kit-web never imports
  `@prisma/client` itself, since it only has real types once generated
  against your own `schema.prisma`:
  ```ts
  import { createSqlitePrismaClient, RUNTIME_DATA_DIR } from 'kit-web'
  import { PrismaClient } from './generated/prisma/client.js'
  import { join } from 'node:path'

  export const db = createSqlitePrismaClient(PrismaClient, join(RUNTIME_DATA_DIR, 'app.db'))
  ```

Each of the four route factories returns a plain
`{ server: { handlers: { GET } } }` object — pass it straight into
`createFileRoute('/whatever')(...)`.

## Usage

```ts
import { createSiteResolver, createLlmsTxtRoute } from 'kit-web'
import { createFileRoute } from '@tanstack/react-router'

interface MySite {
  slug: string
  word: string
}

const resolver = createSiteResolver<MySite>({
  sites: {
    'example.com': { slug: 'example', word: 'EXAMPLE' },
  },
  defaultSite: { slug: '', word: 'ERROR' },
})

export const Route = createFileRoute('/llms.txt')(
  createLlmsTxtRoute(resolver, {
    content: (site) => (site.slug ? `# ${site.word}\n\n...` : undefined),
  }),
)
```

## Install

```json
{
  "dependencies": {
    "kit-web": "github:lxtzfr/kit-web"
  }
}
```

Only needed if you use `createSqlitePrismaClient` — an optional peer, since
plenty of consumers only want the site-resolver/route-factory pieces:

```json
{
  "dependencies": {
    "@prisma/adapter-libsql": "^7.9.1"
  }
}
```

## Not in here (on purpose)

Anything specific to what a site is about — page lists, theme/visual
identity, stat fetchers, business rules. This package only owns the
generic plumbing (host resolution, response formatting, the llms.txt
link-syntax quirk); everything else is config you supply.
