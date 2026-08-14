export type BrandHeadMetaTag =
  | { charSet: string }
  | { name: string; content: string }
  | { title: string }
  | { property: string; content: string }

export interface BrandHeadLink {
  rel: string
  href: string
  type?: string
  sizes?: string
}

export interface BrandHeadInput {
  title: string
  description: string
  /** Used to build asset URLs (`/<slug>/logo.svg` etc.) when `hasBrandAssets` is true. */
  slug: string
  /**
   * Whether this site has generated brand assets — `logo.svg`, `favicon-32.png`,
   * `favicon.ico`, `og.png` — under `public/<slug>/`. Sites without them get
   * bare title/description meta and no favicon links, so the shell doesn't
   * 404 on assets that were never generated.
   */
  hasBrandAssets: boolean
}

// Builds the charset/viewport/title/description/OG/favicon tag set a root
// route's `head()` typically needs for a multi-site app where only some
// sites have generated brand assets (logo/favicon/og-image) — see whatever
// script in your own repo generates `public/<slug>/{logo.svg,favicon-32.png,
// favicon.ico,og.png}`.
export function buildBrandHead({
  title,
  description,
  slug,
  hasBrandAssets,
}: BrandHeadInput): { meta: BrandHeadMetaTag[]; links: BrandHeadLink[] } {
  return {
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title },
      { name: 'description', content: description },
      ...(hasBrandAssets
        ? [
            { property: 'og:title', content: title },
            { property: 'og:description', content: description },
            { property: 'og:image', content: `/${slug}/og.png` },
          ]
        : []),
    ],
    links: hasBrandAssets
      ? [
          { rel: 'icon', type: 'image/svg+xml', href: `/${slug}/logo.svg` },
          { rel: 'icon', type: 'image/png', sizes: '32x32', href: `/${slug}/favicon-32.png` },
          { rel: 'icon', href: `/${slug}/favicon.ico`, sizes: 'any' },
        ]
      : [],
  }
}
