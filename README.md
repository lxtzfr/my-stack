# my-stack

Personal collection of generic, framework-specific kits — one folder per
ecosystem, each independently installable, none of them aware of the
others. No business logic, no assumptions about what a consuming project
is about: every kit is generic plumbing you configure, not a framework.

## Kits

- [`tanstack/`](tanstack) — `@lxtzfr/my-stack-tanstack`: site utilities for
  TanStack Start (host resolution, llms.txt/sitemap/robots routes, head
  meta, Prisma/SQLite bootstrap, ...). The only kit built out so far.
- [`nestjs/`](nestjs) — `@lxtzfr/my-stack-nestjs`: not built yet.
- [`react-native/`](react-native) — `@lxtzfr/my-stack-react-native`: not
  built yet.
- [`unity/`](unity) — not built yet, not an npm package (see its own
  README for why).

Each kit has its own README with what's actually in it and how to install
it — this file only covers what's shared across all of them.

## Philosophy

- **One kit, one ecosystem.** A kit only depends on its own ecosystem's
  tooling. Nothing NestJS-specific leaks into the TanStack kit, nothing
  Unity-specific leaks into React Native, etc.
- **Subpath imports, not a barrel.** Every kit exposes each piece as its
  own subpath import (e.g. `@lxtzfr/my-stack-tanstack/siteResolver`) rather
  than a single flat entry point, so importing one piece never forces
  evaluation of unrelated modules with unmet optional peers or server-only
  code.
- **No business logic.** Kits own generic plumbing; anything specific to
  what a particular app/site/game is about is config the consumer
  supplies, never baked into the kit.
- **Install stays git-based.** Kits aren't published to the npm registry —
  consumers depend on a subdirectory of this repo directly, e.g.
  `"@lxtzfr/my-stack-tanstack": "github:lxtzfr/my-stack#path:tanstack"`.

## Shared tooling

[`shared/`](shared) holds maintainer-only tooling used across kits — right
now, the install/update conventions sync (a pointer into the consuming
project's `CLAUDE.md`, plus a `.gitattributes` line-ending rule). It's not
a runtime dependency of any kit: npm's `path:` subdirectory install only
fetches the referenced kit folder, so each kit ships its own
self-contained, generated copy of the sync script instead — see
[`shared/README.md`](shared/README.md) for how that generation works.

## Workspace

This repo is a pnpm workspace (`pnpm-workspace.yaml`) so kits with real
code can be built/typechecked together during development:

```sh
pnpm install
pnpm --filter @lxtzfr/my-stack-tanstack build
```

Each kit's own README documents its actual install instructions for
consumers, who never see or need the workspace — they install a single
kit as a plain git dependency.
