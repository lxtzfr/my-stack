# my-stack

Personal collection of generic, framework-specific kits — one folder per
ecosystem, each independently installable, none of them aware of the
others. No business logic, no assumptions about what a consuming project
is about: every kit is generic plumbing you configure, not a framework.

## Kits

- [`tanstack/`](tanstack) — `@lxtzfr/my-stack-tanstack`: site utilities for
  TanStack Start (host resolution, llms.txt/sitemap/robots routes, head
  meta, Prisma/SQLite bootstrap, ...).
- [`nestjs/`](nestjs) — `@lxtzfr/my-stack-nestjs`: request-lifecycle
  plumbing for NestJS (request-scoped logging, global exception filters,
  Zod validation pipe).
- [`react-native/`](react-native) — `@lxtzfr/my-stack-react-native`: not
  built yet.
- [`unity/`](unity) — `fr.lxtz.my-stack-unity`: install/update tooling
  for Unity projects (canonical `.gitattributes`/`.gitignore`, LFS setup).
  Not an npm package — see its own README for why. No runtime C# yet.

Each kit has its own README with what's actually in it and how to install
it — this file only covers what's shared across all of them.

Whenever you install a kit, also add
[`@lxtzfr/my-stack-core`](core) as a devDependency — see "Shared tooling"
below for what it sets up and keeps up to date.

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

## Related repos

Not part of this workspace (they're cross-cutting, not tied to one
ecosystem, so they stay as their own repos rather than a kit folder here):

- [`lxtzfr/ci-scripts`](https://github.com/lxtzfr/ci-scripts) — shared CI
  scripts.
- [`lxtzfr/brand-img-gen`](https://github.com/lxtzfr/brand-img-gen) — brand
  image generation.

## Claude Code setup

[`claude/`](claude) holds a quick auto-setup for Claude Code on a new
machine (currently: the Stop-hook notification) — run `pnpm claude:setup`.
See [`claude/README.md`](claude/README.md).

## Shared tooling

[`core/`](core) holds tooling shared across the npm-based kits — the
install/update conventions sync (a pointer into the consuming project's
`CLAUDE.md` per installed kit, a `.gitattributes` line-ending rule, and
Git LFS tracking rules). It's a **devDependency of the consuming
project**, not of any kit — kits stay plain runtime packages, and
`@lxtzfr/my-stack-core` detects which kits are installed by reading the
consumer's own `package.json`. `unity`, which has no npm install step,
ships its own bespoke sync script instead — see
[`core/README.md`](core/README.md) and [`unity/README.md`](unity/README.md).

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
