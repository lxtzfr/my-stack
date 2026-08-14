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
export function createSqlitePrismaClient<TClient extends { $executeRawUnsafe(query: string): Promise<unknown> }>(
  PrismaClientCtor: new (options: { adapter: PrismaLibSql }) => TClient,
  path: string,
  globalKey = '__kitWebPrismaClient',
): TClient {
  return createGlobalSingleton(globalKey, () => {
    const adapter = new PrismaLibSql({ url: `file:${path}` })
    const client = new PrismaClientCtor({ adapter })
    // WAL lets readers proceed while a writer holds the lock (SQLite's
    // default rollback-journal mode blocks every reader too), and a
    // nonzero busy_timeout makes a second writer *wait* for the lock
    // instead of failing immediately. Without both, two writes landing in
    // the same instant — a periodic background job racing a request's own
    // transaction, say — surface as a hard timeout/error instead of just
    // serializing. Not awaited: these are the first commands ever issued
    // on this connection, and SQLite connections process commands in
    // issue order, so every query the caller makes afterwards is
    // necessarily queued behind them regardless.
    client.$executeRawUnsafe('PRAGMA journal_mode = WAL').catch(() => {})
    client.$executeRawUnsafe('PRAGMA busy_timeout = 5000').catch(() => {})
    return client
  })
}
