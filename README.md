# kit-web

Generic site utilities for TanStack Start — works for a single-domain app
or a multi-domain one with the same API. No business logic, no assumptions
about what your site is about: you always supply your own `TSite` config
and content.

**Each piece is its own subpath import** (`kit-web/siteResolver`, not a
flat `kit-web` barrel) — deliberately, not just for tidiness: in Vite dev
mode (no tree-shaking), importing anything from a single barrel entry point
forces *every* re-exported module to be evaluated, including ones with
unmet optional peers (`prismaSqlite.js`'s `@prisma/adapter-libsql`) or
server-only imports (`siteConfigServerFn.js`'s `@tanstack/react-start/
server`) — that can leak server-only code into a client bundle, or crash a
consumer that only wanted the site resolver and never installed Prisma.
Subpath imports mean you only ever load what you actually import.

## What's in here

- **`kit-web/siteResolver`** — `createSiteResolver` / `createSingleSiteResolver`:
  host → site resolution, with an optional local-dev "view as another
  domain" cookie override (never honored outside local hosts, so it can't
  be used to spoof a domain in production).
- **`kit-web/siteConfigServerFn`** — `resolveSiteWithDevOverride`: the logic
  behind a client-callable "get current site" server function, with a
  `?__site=` query-param escape hatch on local hosts (stashed in a cookie so
  it survives loader revalidations). **Not** wrapped in `createServerFn`
  itself — TanStack Start's server-function compiler only scans your app's
  own source, not code inside `node_modules` — you wrap it in your own
  `createServerFn` call:
  ```ts
  import { createServerFn } from '@tanstack/react-start'
  import { resolveSiteWithDevOverride } from 'kit-web/siteConfigServerFn'

  export const getSiteConfig = createServerFn({ method: 'GET' }).handler(
    (): MySite => resolveSiteWithDevOverride(resolver),
  )
  ```
- **`kit-web/llmsTxt`** — `createLlmsTxtRoute`: an
  [llms.txt](https://llmstxt.org) route handler factory.
- **`kit-web/sitemap`** — `createSitemapRoute`: a `sitemap.xml` route
  handler factory.
- **`kit-web/robots`** — `createRobotsRoute`: a `robots.txt` route handler
  factory.
- **`kit-web/headMeta`** — `buildHeadMeta`: title/description/OG/Twitter
  `<head>` tag builder.
- **`kit-web/globalSingleton`** — `createGlobalSingleton`: `globalThis`-backed
  memoization for "one instance per process" state (an event bus, a DB
  client...) — needed because Vite/Nitro bundle route handlers and server
  functions into separate chunks, so a plain module-level variable would
  give each chunk its own private copy instead of sharing one.
- **`kit-web/eventBus`** — `publish` / `subscribe`: generic in-process
  pub/sub (built on `createGlobalSingleton`), for broadcasting to an SSE
  endpoint without that route needing to know about every channel up front.
- **`kit-web/dataDir`** — `RUNTIME_DATA_DIR`: where runtime-writable state
  persists across redeploys (`process.env.DATA_DIR`, falling back to
  `./data` locally).
- **`kit-web/prismaSqlite`** — `createSqlitePrismaClient`: Prisma + SQLite
  bootstrap via `@prisma/adapter-libsql` (works unmodified on Alpine/musl —
  no native query-engine binary), memoized with `createGlobalSingleton`.
  Takes your own generated `PrismaClient` constructor — kit-web never
  imports `@prisma/client` itself, since it only has real types once
  generated against your own `schema.prisma`:
  ```ts
  import { createSqlitePrismaClient } from 'kit-web/prismaSqlite'
  import { RUNTIME_DATA_DIR } from 'kit-web/dataDir'
  import { PrismaClient } from './generated/prisma/client.js'
  import { join } from 'node:path'

  export const db = createSqlitePrismaClient(PrismaClient, join(RUNTIME_DATA_DIR, 'app.db'))
  ```

Each of the four route factories returns a plain
`{ server: { handlers: { GET } } }` object — pass it straight into
`createFileRoute('/whatever')(...)`.

## Usage

```ts
import { createSiteResolver } from 'kit-web/siteResolver'
import { createLlmsTxtRoute } from 'kit-web/llmsTxt'
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

`@prisma/adapter-libsql` is only needed if you actually import
`kit-web/prismaSqlite` — declared as an optional peer, not a hard
dependency, precisely so consumers who only want the site-resolver/route-
factory pieces never need to install it:

```json
{
  "dependencies": {
    "@prisma/adapter-libsql": "^7.9.1"
  }
}
```

## Conventions for AI coding assistants

Installing kit-web also drops a short block of architectural conventions
(server/client/lib/rpc folder organization — see `conventions/CLAUDE.md`)
into your project's own `CLAUDE.md`, delimited by
`<!-- kit-web:conventions:start/end -->` markers, so tools like Claude Code
pick it up automatically in every project that depends on kit-web instead
of it living only in one machine's local memory. It also ensures a
`.gitattributes` with `* text=auto eol=lf` exists (delimited the same way,
under `# kit-web:gitattributes:start/end`), so CRLF/LF warnings and
spurious "modified" files from a contributor's own `core.autocrlf` setting
stop happening. Both run on install (`postinstall`) and are safe to
re-run — each only touches its own delimited block, never the rest of the
file, and neither does anything in CI (`process.env.CI`).

After bumping your `kit-web` version, re-sync manually to pick up any
changes to the conventions themselves:

```sh
npx kit-web-sync-conventions
```

## Not in here (on purpose)

Anything specific to what a site is about — page lists, theme/visual
identity, stat fetchers, business rules. This package only owns the
generic plumbing (host resolution, response formatting, the llms.txt
link-syntax quirk); everything else is config you supply.
