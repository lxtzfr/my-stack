import { PrismaLibSql } from '@prisma/adapter-libsql'
import { createGlobalSingleton } from './globalSingleton.js'

// Generic Prisma+SQLite bootstrap — every project's `schema.prisma` (and
// its generated Client type) is necessarily its own, so this doesn't try
// to own the schema the way createSiteResolver owns a TSite shape; it only
// owns the boilerplate that's identical regardless of schema: wiring the
// libSQL driver adapter to a file path (works unmodified on Alpine/musl —
// no native query-engine binary, unlike Prisma's older engine mode) and
// memoizing the client via createGlobalSingleton so a dev reload or a
// route/server-function living in a different Vite/Nitro chunk never opens
// a second connection to the same file.
//
// `PrismaClientCtor` is the caller's own generated `PrismaClient` class —
// kit-web deliberately never imports `@prisma/client` itself, since that
// package only has real types once generated against the caller's own
// schema.
export function createSqlitePrismaClient<TClient>(
  PrismaClientCtor: new (options: { adapter: PrismaLibSql }) => TClient,
  path: string,
  globalKey = '__kitWebPrismaClient',
): TClient {
  return createGlobalSingleton(globalKey, () => {
    const adapter = new PrismaLibSql({ url: `file:${path}` })
    return new PrismaClientCtor({ adapter })
  })
}
