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
kit-web).

While iterating on such a fix, `pnpm link ../kit-web` (rebuild kit-web
after each edit) instead of committing every attempt. On at least some
pnpm versions this *does* rewrite the `kit-web` entry in `package.json`
(to `link:../kit-web`) and `pnpm-lock.yaml`, despite only being meant to
touch `node_modules` — check `git diff package.json pnpm-lock.yaml` before
moving on, and `git checkout -- package.json pnpm-lock.yaml` to discard
that rewrite if present. Once the fix is confirmed working, commit + push
it in the kit-web repo, then restore the real dependency here:

```sh
git checkout -- package.json pnpm-lock.yaml   # only if `pnpm link` rewrote them — see above
pnpm install          # drops the link, restores the real dependency
pnpm update kit-web   # pulls in the just-pushed fix (or any other kit-web change)
```

## Don't leave background dev servers running

When starting a dev server to test something (`pnpm dev` and similar),
track it so it can actually be stopped afterwards — don't fire-and-forget
with a raw shell `&`/`nohup`. A background dev server that's never killed
is easy to lose track of, and a stray one holding the same SQLite file
open (each with its own in-memory state — cooldown maps, cached ids,
timers) is a real source of confusing bugs, not just clutter. On Windows,
`pkill`/`kill` from a POSIX shell often can't actually terminate a
natively-spawned `node.exe` — use `Stop-Process -Id <pid>` (PowerShell)
instead. Stop it explicitly once you're done testing rather than leaving
it "in case it's needed again."

## Keep this file itself concise

This block is synced into every project depending on kit-web — trim
before adding. Prefer editing or replacing a point over appending a new
one.
