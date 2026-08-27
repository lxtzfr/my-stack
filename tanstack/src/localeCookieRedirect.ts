// Pairs with `./locale.js` (`createLocaleConfig`): remembers an explicit
// language choice in a cookie and redirects an unprefixed page back to it on
// a later visit — never `Accept-Language`, so a first-time visitor or a
// crawler with no cookie is never redirected. That keeps it safe to use on
// every unprefixed route without touching indexing or first-load UX.
//
// `createIsomorphicFn` (not a runtime `typeof document` check) is what keeps
// `@tanstack/react-start/server`'s `getCookie` out of the client bundle —
// TanStack Start's Vite plugin statically denies that import wherever it's
// reachable from client code, even behind a runtime guard, and fails the
// build ("Import denied in client environment"). Splitting the read into an
// isomorphic function's `.client()`/`.server()` branches is what makes the
// bundler actually strip the server branch from the client build.

import { redirect } from '@tanstack/react-router'
import { createIsomorphicFn } from '@tanstack/react-start'
import { getCookie } from '@tanstack/react-start/server'
import type { LocaleConfig } from './locale.js'

export interface LocaleCookieRedirectOptions {
  /** Defaults to "locale". */
  cookieName?: string
  /** Cookie lifetime in seconds. Defaults to one year. */
  maxAgeSeconds?: number
}

export interface LocaleCookieRedirect<L extends string> {
  cookieName: string
  /** Call from the language switcher's click handler, before navigating. */
  remember(locale: L): void
  /**
   * Call from an unprefixed route's `beforeLoad` with that route's
   * locale-agnostic bare path (e.g. "/pricing") — redirects to the
   * visitor's remembered locale's twin of that same page, if they've ever
   * picked one other than the default. Throws TanStack Router's `redirect`,
   * so just call it — don't wrap in `throw` yourself.
   */
  redirectToRemembered(bare: string): void
}

export function createLocaleCookieRedirect<L extends string>(
  config: LocaleConfig<L>,
  options: LocaleCookieRedirectOptions = {},
): LocaleCookieRedirect<L> {
  const cookieName = options.cookieName ?? 'locale'
  const maxAge = options.maxAgeSeconds ?? 60 * 60 * 24 * 365

  const readCookie = createIsomorphicFn()
    .client((): string | undefined => {
      const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${cookieName}=([^;]+)`))
      return match ? decodeURIComponent(match[1]) : undefined
    })
    .server((): string | undefined => {
      try {
        return getCookie(cookieName)
      } catch {
        // Outside a request context (e.g. at build time) — no cookie to read.
        return undefined
      }
    })

  function remember(locale: L): void {
    document.cookie = `${cookieName}=${locale}; path=/; max-age=${maxAge}; samesite=lax`
  }

  function redirectToRemembered(bare: string): void {
    const saved = readCookie()
    if (saved && config.isLocale(saved) && saved !== config.defaultLocale) {
      throw redirect({ href: config.localizedPath(saved, bare) })
    }
  }

  return { cookieName, remember, redirectToRemembered }
}
