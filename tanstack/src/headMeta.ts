export interface PageMeta {
  title: string
  description: string
  ogImage?: string
  twitterCard?: 'summary' | 'summary_large_image'
}

export type MetaTag = { title: string } | { name: string; content: string } | { property: string; content: string }

// Builds the title/description/OG/Twitter tag set most route `head()`
// callbacks need — same tag keys across every page, so a router's by-tag
// meta merging replaces each one instead of piling up duplicates alongside
// whatever a root layout already set.
export function buildHeadMeta(meta: PageMeta): MetaTag[] {
  const tags: MetaTag[] = [
    { title: meta.title },
    { name: 'description', content: meta.description },
    { property: 'og:title', content: meta.title },
    { property: 'og:description', content: meta.description },
    { name: 'twitter:title', content: meta.title },
    { name: 'twitter:description', content: meta.description },
  ]
  if (meta.ogImage) tags.push({ property: 'og:image', content: meta.ogImage })
  if (meta.twitterCard) tags.push({ name: 'twitter:card', content: meta.twitterCard })
  return tags
}
