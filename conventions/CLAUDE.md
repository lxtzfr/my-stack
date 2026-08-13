## Server/client code organization (kit-web convention)

When a module mixes server-only and client-only logic (e.g. a TanStack
Start feature with DB access, browser-only rendering, and the RPC actions
connecting them), split it into subfolders by where the code actually
executes, not by feature:

- `server/` — Node-only (DB, secrets, filesystem, cookies). Every file
  ends in `.server.ts` — required by TanStack Start's bundler to exclude it
  from the client bundle, even though the folder name already says the
  same thing.
- `client/` — browser-only (React components, DOM/Canvas/WebGL, hooks).
  Never imports anything from `server/` directly.
- `lib/` — plain data shared identically by both sides: types, constants,
  pure functions. No Node-only or browser-only APIs.
- `rpc/` — one file per `createServerFn` action. Each of these compiles to
  two different implementations from the same source (a network-call stub
  on the client, the real handler on the server), so it belongs to neither
  `server/` nor `client/` on its own — group RPC boundary files together
  instead of forcing them into one side.

Keep files small — one exported concern per file rather than one big
module mixing types, constants, and logic together. Give shared
engine/plumbing code generic names; never bake a specific product, site,
or tenant name into it (e.g. `Block`, not `AcmeBlock`) — that way the code
stays reusable if the app later needs to diverge per site/tenant without a
rename pass first.
