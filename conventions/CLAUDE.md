## Server/client code organization

When a module mixes server-only and client-only logic — e.g. a feature
with DB access, browser-only rendering, and the request/response actions
connecting the two — split it into subfolders by where the code actually
executes, not by feature:

- `server/` — code that only ever runs on the server (DB, secrets,
  filesystem, cookies). Never imported by client-side code.
- `client/` — code that only ever runs in the browser (UI components,
  DOM/Canvas/WebGL, browser-only hooks). Never imports from `server/`
  directly.
- `lib/` — plain data/logic shared identically by both sides: types,
  constants, pure functions. No server-only or browser-only APIs.
- `rpc/` (or `actions/`) — one file per client↔server boundary call (a
  server action, an API route handler, a tRPC procedure...). This kind of
  file is defined once but often compiles or behaves differently per side
  (e.g. a network-call stub on the client vs. the real handler on the
  server), so it belongs to neither `server/` nor `client/` on its own —
  group these together instead of forcing them into one side.

If your framework needs a specific file-naming marker to keep server-only
code out of the client bundle (e.g. TanStack Start's `.server.ts` suffix,
Next.js's `'use server'` directive), keep using it even inside `server/` —
the folder is for humans, the marker is what the bundler actually reads.

Keep files small — one exported concern per file rather than one big
module mixing types, constants, and logic together. Give shared
engine/plumbing code generic names; never bake a specific product, site,
or tenant name into it (e.g. `Item`, not `AcmeItem`) — that way the code
stays reusable if the app later needs to diverge per site/tenant without a
rename pass first.
