## Server/client code organization

Split modules that mix server-only and client-only logic into subfolders
by where the code executes, not by feature:

- `server/` — server-only (DB, secrets, filesystem, cookies). Never
  imported by client code.
- `client/` — browser-only (UI, DOM/Canvas/WebGL, browser hooks). Never
  imports from `server/`.
- `lib/` — plain data/logic shared by both sides: types, constants, pure
  functions.
- `rpc/` (or `actions/`) — one file per client↔server boundary call
  (server action, API route, tRPC procedure). Defined once but compiles
  or behaves differently per side, so it belongs to neither folder alone.

Still apply your framework's own server-only marker where required (e.g.
TanStack Start's `.server.ts` suffix, Next's `'use server'`) — the folder
is for humans, the marker is what the bundler reads.

Keep files small (one concern per file) and names generic — never bake a
product/site/tenant name into shared code (`Item`, not `AcmeItem`).

## Contributing back to kit-web

Bugs and generic/reusable code that belong to kit-web's own domain (SQLite
bootstrap, event bus, site resolution...) get fixed in the kit-web repo
itself, not patched locally — including bugs only discovered indirectly
(e.g. a DB timeout here that's actually a missing busy-timeout setting in
kit-web). Pull the fix back with:

```sh
pnpm update kit-web   # or: npm update kit-web
```

Same command for pulling in any kit-web change, including ones you didn't
make yourself — it also refreshes this block.

## Keep this file itself concise

This block is synced into every project depending on kit-web — trim
before adding. Prefer editing or replacing a point over appending a new
one.
