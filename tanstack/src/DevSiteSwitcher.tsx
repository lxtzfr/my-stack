import { useLocation } from '@tanstack/react-router'
import { Button, Group } from '@mantine/core'

export interface DevSiteSwitcherSite {
  /** Domain to pass as the override query param, e.g. `other-site.example.com`. */
  domain: string
  /** Matched against `currentSlug` to grey out (and disable) the entry for the site already being viewed. */
  slug: string
  label: string
}

// Dev-only quick site switcher for a multi-domain app (see siteResolver.ts /
// siteConfigServerFn.ts) — so testing another configured domain locally
// doesn't require hand-editing the override query param in the address bar.
// `import.meta.env.DEV` is a build-time constant, so this is
// dead-code-eliminated out of production bundles entirely — real visitors
// never receive it.
//
// Plain `<a href>` (via Button's `component="a"`), not a `<button onClick>`
// — this only ever needs a full page navigation (the override is read
// server-side from the query param), so a real link works even
// before/without JS hydration instead of depending on an onClick handler
// having attached. The link points at the *current* path (with the override
// param merged into its existing search string) rather than always `/`, so
// switching sites mid-navigation doesn't bounce back to the root.
export function DevSiteSwitcher({
  sites,
  currentSlug,
  queryParam = '__site',
}: {
  sites: readonly DevSiteSwitcherSite[]
  currentSlug: string
  queryParam?: string
}) {
  const location = useLocation()
  if (!import.meta.env.DEV) return null

  function hrefFor(domain: string) {
    const params = new URLSearchParams(location.searchStr)
    params.set(queryParam, domain)
    return `${location.pathname}?${params.toString()}`
  }

  return (
    <Group gap={4} style={{ position: 'fixed', bottom: 8, right: 8, zIndex: 9999 }}>
      {sites.map(({ domain, slug, label }) => {
        const isCurrent = slug === currentSlug
        return (
          <Button
            key={domain}
            component="a"
            href={hrefFor(domain)}
            aria-disabled={isCurrent}
            variant={isCurrent ? 'filled' : 'outline'}
            color="dark"
            size="compact-xs"
            styles={{ root: { fontFamily: 'monospace', pointerEvents: isCurrent ? 'none' : 'auto' } }}
          >
            {label}
          </Button>
        )
      })}
    </Group>
  )
}
