// Generic locale-prefix routing helpers. Framework-agnostic (no TanStack
// Router import) — the app's own $locale route param is what actually
// switches content; this just centralizes the URL shape and hreflang math
// so every page builds them the same way.
//
// Convention: the default locale is unprefixed ("/modules"), every other
// locale gets a leading segment ("/fr/modules"). This means shipping a new
// locale is a content-only change (translations + registering it in
// `locales`) — no new routes, no path-building code to touch.

export interface LocaleConfigOptions<L extends string> {
  /** All locales this site serves, including the default. Order doesn't matter. */
  locales: readonly L[]
  /** Served unprefixed at the bare path — every other locale gets a `/<locale>` prefix. */
  defaultLocale: L
}

export interface HreflangLink {
  rel: 'alternate'
  hreflang: string
  href: string
}

export interface LocaleConfig<L extends string> {
  locales: readonly L[]
  defaultLocale: L
  /** Type guard — narrows a route param / string to a configured locale. */
  isLocale(value: string): value is L
  /**
   * Prefixes a locale-agnostic, root-relative path for the given locale.
   * `path` must start with "/" (e.g. "/", "/modules/deicing").
   */
  localizedPath(locale: L, path: string): string
  /**
   * Splits an incoming pathname into its locale and the bare (unprefixed)
   * path. Falls back to the default locale when there's no recognized
   * prefix, so an unprefixed request always resolves rather than 404ing.
   */
  resolveLocaleFromPath(pathname: string): { locale: L; path: string }
  /**
   * `<link rel="alternate" hreflang="...">` entries for every configured
   * locale plus `x-default`, for the given bare path — attach the same set
   * to every localized variant of a page, not just the translated ones.
   */
  hreflangLinks(origin: string, path: string): HreflangLink[]
}

const LOCALE_PREFIX_RE = /^\/([a-z]{2}(?:-[A-Z]{2})?)(\/.*)?$/

export function createLocaleConfig<L extends string>(options: LocaleConfigOptions<L>): LocaleConfig<L> {
  const { locales, defaultLocale } = options

  function isLocale(value: string): value is L {
    return (locales as readonly string[]).includes(value)
  }

  function localizedPath(locale: L, path: string): string {
    if (locale === defaultLocale) return path
    return path === '/' ? `/${locale}` : `/${locale}${path}`
  }

  function resolveLocaleFromPath(pathname: string): { locale: L; path: string } {
    const match = LOCALE_PREFIX_RE.exec(pathname)
    if (match && isLocale(match[1])) return { locale: match[1] as L, path: match[2] || '/' }
    return { locale: defaultLocale, path: pathname || '/' }
  }

  function hreflangLinks(origin: string, path: string): HreflangLink[] {
    const links: HreflangLink[] = locales.map((locale) => ({
      rel: 'alternate',
      hreflang: locale,
      href: `${origin}${localizedPath(locale, path)}`,
    }))
    links.push({ rel: 'alternate', hreflang: 'x-default', href: `${origin}${localizedPath(defaultLocale, path)}` })
    return links
  }

  return { locales, defaultLocale, isLocale, localizedPath, resolveLocaleFromPath, hreflangLinks }
}
