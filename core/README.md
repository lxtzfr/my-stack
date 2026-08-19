# core

`@lxtzfr/my-stack-core` is install/update tooling for `my-stack` kits: a
`CLAUDE.md` conventions pointer per installed kit, a `.gitattributes`
line-ending rule, and Git LFS tracking rules for common binary
extensions.

It's a **devDependency of the consuming project**, not a dependency of
any kit — kits (`tanstack`, `nestjs`, `react-native`, ...) stay plain
runtime packages with no install-time tooling of their own. On
`postinstall`, `sync-conventions.mjs` reads the consumer's own
`package.json` for any `@lxtzfr/my-stack-*` dependency (besides itself)
and writes that kit's conventions pointer — so a consumer installs both:

```json
{
  "dependencies": {
    "@lxtzfr/my-stack-tanstack": "github:lxtzfr/my-stack#path:tanstack"
  },
  "devDependencies": {
    "@lxtzfr/my-stack-core": "github:lxtzfr/my-stack#path:core"
  }
}
```

On the same `postinstall`, `check-freshness.mjs` also compares the
commit each `@lxtzfr/my-stack-*` package is locked to (read from
`pnpm-lock.yaml`) against my-stack's current default-branch commit, and
prints a warning if a project is behind — the git-dependency equivalent
of `npm outdated`, since these deps have no semver to check. Silent if
offline, in CI, or on a non-pnpm project. Re-run manually with
`npx my-stack-check-freshness`.

Re-run `sync-conventions.mjs` manually with `npx my-stack-sync-conventions`. Each block
(the `.gitattributes`/LFS rules once, each kit's CLAUDE.md pointer
individually) is delimited by its own start/end markers, so re-running is
idempotent and only touches its own block.

`unity` has no npm `postinstall` step to hang a real `@lxtzfr/my-stack-core`
dependency off of (it's a UPM package, not an npm one), so it ships its
own bespoke, self-contained `unity/scripts/sync-conventions.mjs` instead
of depending on this package — a consumer runs it by hand after adding
the UPM dependency. See [`unity/README.md`](../unity/README.md).
