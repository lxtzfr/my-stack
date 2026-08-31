# @lxtzfr/my-stack-tanstack

Generic site utilities for TanStack Start — works for a single-domain app
or a multi-domain one with the same API. No business logic, no assumptions
about what your site is about: you always supply your own `TSite` config
and content.

**Each piece is its own subpath import** (`@lxtzfr/my-stack-tanstack/siteResolver`,
not a flat barrel) — deliberately, not just for tidiness: in Vite dev
mode (no tree-shaking), importing anything from a single barrel entry point
forces *every* re-exported module to be evaluated, including ones with
unmet optional peers (`prismaSqlite.js`'s `@prisma/adapter-libsql`) or
server-only imports (`siteConfigServerFn.js`'s `@tanstack/react-start/
server`) — that can leak server-only code into a client bundle, or crash a
consumer that only wanted the site resolver and never installed Prisma.
Subpath imports mean you only ever load what you actually import.

## What's in here

- **`@lxtzfr/my-stack-tanstack/siteResolver`** — `createSiteResolver` / `createSingleSiteResolver`:
  host → site resolution, with an optional local-dev "view as another
  domain" cookie override (never honored outside local hosts, so it can't
  be used to spoof a domain in production).
- **`@lxtzfr/my-stack-tanstack/forwardedOrigin`** — `forwardedOrigin` / `withForwardedOrigin`: reads Traefik's
  `X-Forwarded-Proto`/`X-Forwarded-Host` headers, since every app here sits behind it and a raw
  `Request`'s own `.url` is always `http://`. Use `withForwardedOrigin(request)` before handing a
  `Request` to code that derives an absolute URL from `request.url` itself and has no forwarded-
  header support of its own — `@auth/core`'s `Auth()` being the motivating example (wrong `http://`
  OAuth `redirect_uri`, wrong `Secure`-cookie decision, otherwise).
- **`@lxtzfr/my-stack-tanstack/siteConfigServerFn`** — `resolveSiteWithDevOverride`: the logic
  behind a client-callable "get current site" server function, with a
  `?__site=` query-param escape hatch on local hosts (stashed in a cookie so
  it survives loader revalidations). **Not** wrapped in `createServerFn`
  itself — TanStack Start's server-function compiler only scans your app's
  own source, not code inside `node_modules` — you wrap it in your own
  `createServerFn` call:
  ```ts
  import { createServerFn } from '@tanstack/react-start'
  import { resolveSiteWithDevOverride } from '@lxtzfr/my-stack-tanstack/siteConfigServerFn'

  export const getSiteConfig = createServerFn({ method: 'GET' }).handler(
    (): MySite => resolveSiteWithDevOverride(resolver),
  )
  ```
- **`@lxtzfr/my-stack-tanstack/llmsTxt`** — `createLlmsTxtRoute`: an
  [llms.txt](https://llmstxt.org) route handler factory.
- **`@lxtzfr/my-stack-tanstack/sitemap`** — `createSitemapRoute`: a `sitemap.xml` route
  handler factory.
- **`@lxtzfr/my-stack-tanstack/robots`** — `createRobotsRoute`: a `robots.txt` route handler
  factory.
- **`@lxtzfr/my-stack-tanstack/locale`** — `createLocaleConfig`: locale-prefix URL helpers
  for a multi-locale site (default locale unprefixed, e.g. `/modules`; every other locale gets
  a `/xx` prefix, e.g. `/fr/modules`) — `localizedPath`, `resolveLocaleFromPath`, and
  `hreflangLinks` for `<link rel="alternate" hreflang="...">` tags. Framework-agnostic (no
  router import); pair it with your own `$locale` dynamic route segment to actually switch
  content. Adding a locale later is a content-only change — register it in `locales` and ship
  translations, no new routes.
- **`@lxtzfr/my-stack-tanstack/localeCookieRedirect`** — `createLocaleCookieRedirect`: pairs
  with a `LocaleConfig` from `./locale` to remember an explicit language-switcher choice in a
  cookie and redirect an unprefixed route back to it on a later visit — `remember(locale)` from
  the switcher's click handler, `redirectToRemembered(barePath)` from an unprefixed route's
  `beforeLoad`. Never reads `Accept-Language`; a visitor or crawler with no cookie is never
  redirected, so it's safe to call from every unprefixed route without risking indexing or
  first-load UX. Uses `createIsomorphicFn` internally (required, not a `typeof document` check)
  so `@tanstack/react-start/server`'s `getCookie` never reaches the client bundle — TanStack
  Start's Vite plugin statically denies that import from client-reachable code regardless of a
  runtime guard, and fails the build.
- **`@lxtzfr/my-stack-tanstack/headMeta`** — `buildHeadMeta`: title/description/OG/Twitter
  `<head>` tag builder.
- **`@lxtzfr/my-stack-tanstack/brandHead`** — `buildBrandHead`: charset/viewport/title/
  description/OG/favicon tag set for a root route's `head()`, for multi-site apps where
  only some sites have generated brand assets (`public/<slug>/{logo.svg,favicon-32.png,
  favicon.ico,og.png}`) — sites without them get bare title/description and no favicon
  links instead of 404ing on assets that were never generated.
- **`@lxtzfr/my-stack-tanstack/globalSingleton`** — `createGlobalSingleton`: `globalThis`-backed
  memoization for "one instance per process" state (an event bus, a DB
  client...) — needed because Vite/Nitro bundle route handlers and server
  functions into separate chunks, so a plain module-level variable would
  give each chunk its own private copy instead of sharing one.
- **`@lxtzfr/my-stack-tanstack/eventBus`** — `publish` / `subscribe`: generic in-process
  pub/sub (built on `createGlobalSingleton`), for broadcasting to an SSE
  endpoint without that route needing to know about every channel up front.
- **`@lxtzfr/my-stack-tanstack/dataDir`** — `RUNTIME_DATA_DIR`: where runtime-writable state
  persists across redeploys (`process.env.DATA_DIR`, falling back to
  `./data` locally).
- **`@lxtzfr/my-stack-tanstack/prismaSqlite`** — `createSqlitePrismaClient`: Prisma + SQLite
  bootstrap via `@prisma/adapter-libsql` (works unmodified on Alpine/musl —
  no native query-engine binary), memoized with `createGlobalSingleton`.
  Takes your own generated `PrismaClient` constructor — this package never
  imports `@prisma/client` itself, since it only has real types once
  generated against your own `schema.prisma`:
  ```ts
  import { createSqlitePrismaClient } from '@lxtzfr/my-stack-tanstack/prismaSqlite'
  import { RUNTIME_DATA_DIR } from '@lxtzfr/my-stack-tanstack/dataDir'
  import { PrismaClient } from './generated/prisma/client.js'
  import { join } from 'node:path'

  export const db = createSqlitePrismaClient(PrismaClient, join(RUNTIME_DATA_DIR, 'app.db'))
  ```
- **`@lxtzfr/my-stack-tanstack/device`** — `parseDevice`: turns a raw
  `User-Agent` header into a coarse `DeviceType` (`mobile`/`tablet`/
  `desktop`/`smarttv`/`console`/`wearable`/`embedded`/`xr`/`unknown`) plus a
  human-readable "Platform · Browser" label, e.g. for a visitor log. Built
  on `ua-parser-js`.

Each of the four route factories returns a plain
`{ server: { handlers: { GET } } }` object — pass it straight into
`createFileRoute('/whatever')(...)`.

## Usage

```ts
import { createSiteResolver } from '@lxtzfr/my-stack-tanstack/siteResolver'
import { createLlmsTxtRoute } from '@lxtzfr/my-stack-tanstack/llmsTxt'
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
    "@lxtzfr/my-stack-tanstack": "github:lxtzfr/my-stack#path:tanstack"
  },
  "devDependencies": {
    "@lxtzfr/my-stack-core": "github:lxtzfr/my-stack#path:core"
  }
}
```

`@lxtzfr/my-stack-core` is optional but recommended — see "Conventions
for AI coding assistants" below for what it sets up.

`@prisma/adapter-libsql` is only needed if you actually import
`@lxtzfr/my-stack-tanstack/prismaSqlite` — declared as an optional peer, not a hard
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

Also installing `@lxtzfr/my-stack-core` (see Install above) drops a
one-line pointer into your project's own `CLAUDE.md`, delimited by
`<!-- @lxtzfr/my-stack-tanstack:conventions:start/end -->` markers,
telling an AI coding assistant to read `node_modules/@lxtzfr/my-stack-tanstack/conventions/
CLAUDE.md` for the actual architectural conventions (server/client/lib/rpc
folder organization, contributing fixes back upstream, etc.) — a pointer
rather than a copy, so there's nothing to fall out of sync when the
conventions themselves change. It also ensures a `.gitattributes` with
`* text=auto eol=lf` and Git LFS tracking rules for common binary
extensions exist (delimited the same way, under `# my-stack:gitattributes:start/end`
and `# my-stack:gitattributes-lfs:start/end`), so CRLF/LF warnings and
spurious "modified" files from a contributor's own `core.autocrlf`
setting stop happening, and binary assets don't bloat the repo. Runs on
`@lxtzfr/my-stack-core`'s install (`postinstall`) and is safe to re-run —
each block only touches its own delimited region, never the rest of the
file, and none of it does anything in CI (`process.env.CI`). Re-run
manually with:

```sh
npx my-stack-sync-conventions
```

## Not in here (on purpose)

Anything specific to what a site is about — page lists, theme/visual
identity, stat fetchers, business rules. This package only owns the
generic plumbing (host resolution, response formatting, the llms.txt
link-syntax quirk); everything else is config you supply.
