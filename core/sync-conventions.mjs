#!/usr/bin/env node
// Injects/updates managed blocks into the *consuming* project — a
// one-line CLAUDE.md pointer at each installed kit's conventions/CLAUDE.md,
// a .gitattributes line-ending rule, and Git LFS tracking rules for common
// binary extensions. The CLAUDE.md pointer is a pointer, not a copy of the
// actual conventions text: git only reads .gitattributes from the repo
// it's operating on so that one has to be real content, but an AI coding
// assistant that already reads the consuming project's own CLAUDE.md will
// follow a plain-text instruction inside it to go read another file —
// including one under node_modules — so there's nothing to keep in sync
// there.
//
// @lxtzfr/my-stack-core is a *devDependency* of the consuming project
// itself (not a dependency of any kit) — kits (tanstack, nestjs,
// react-native, ...) stay plain runtime packages with no install-time
// tooling of their own. This script finds out which kits are actually
// installed by reading the consumer's own package.json directly (any
// `@lxtzfr/my-stack-*` dependency other than itself), rather than being
// invoked once per kit.
//
// Each block is delimited by its own START/END markers so re-running only
// touches its own block, leaving the rest of the file alone — and so it's
// idempotent (running it twice in a row is a no-op, not a duplicate
// block). The CLAUDE.md pointer's markers are namespaced per kit-package-
// name so multiple my-stack kits installed in the same consumer never
// collide; the .gitattributes/LFS rules aren't kit-specific, so they're
// written once under a single `my-stack` namespace.

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, sep } from 'node:path'
import { execSync } from 'node:child_process'

// Lifecycle scripts run with cwd inside node_modules/@lxtzfr/my-stack-core —
// INIT_CWD is npm/pnpm's own env var for "where the top-level install was
// actually run from" (the consuming project's root). Falls back to cwd for
// a direct invocation, where INIT_CWD isn't set but cwd already *is* the
// right place.
const targetRoot = process.env.INIT_CWD || process.cwd()

function installedKitNames() {
  const pkgPath = join(targetRoot, 'package.json')
  if (!existsSync(pkgPath)) return []

  const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))
  const allDeps = { ...pkg.dependencies, ...pkg.devDependencies, ...pkg.peerDependencies }

  return Object.keys(allDeps).filter(
    (name) => name.startsWith('@lxtzfr/my-stack-') && name !== '@lxtzfr/my-stack-core',
  )
}

// Merges `wrapped` (already including its own start/end markers) into
// `path`, replacing a previous run's block if the markers are found,
// appending otherwise, creating the file if it doesn't exist yet at all.
function syncManagedBlock(path, start, end, wrapped) {
  const existing = existsSync(path) ? readFileSync(path, 'utf-8') : ''

  let next
  if (existing.includes(start) && existing.includes(end)) {
    const before = existing.slice(0, existing.indexOf(start))
    const after = existing.slice(existing.indexOf(end) + end.length)
    next = `${before}${wrapped}${after}`
  } else if (existing.trim().length > 0) {
    next = `${existing.trimEnd()}\n\n${wrapped}\n`
  } else {
    next = `${wrapped}\n`
  }

  if (next === existing) return false
  writeFileSync(path, next, 'utf-8')
  return true
}

function syncClaudeMd(kitPkgName) {
  const START = `<!-- ${kitPkgName}:conventions:start -->`
  const END = `<!-- ${kitPkgName}:conventions:end -->`
  const wrapped = `${START}\n<!-- Managed by @lxtzfr/my-stack-core. -->\n\nFor architectural conventions shared across ${kitPkgName} projects (server/client/lib/rpc folder\norganization, contributing fixes back upstream, etc.), read\n\`node_modules/${kitPkgName}/conventions/CLAUDE.md\`.\n${END}`

  const path = join(targetRoot, 'CLAUDE.md')
  const wasExisting = existsSync(path)
  if (syncManagedBlock(path, START, END, wrapped)) {
    console.log(`[my-stack-core] ${wasExisting ? 'updated' : 'created'} ${kitPkgName} conventions pointer in ${path}`)
  }
}

// Windows' common `core.autocrlf=true` default plus no .gitattributes means
// every git operation re-warns about line-ending conversion on the same
// files and can make them show as "modified" with zero real content diff —
// which among other things breaks any tooling that checks for a clean
// working tree before acting (e.g. a deploy script). Pinning eol=lf at the
// repo level makes this deterministic regardless of a contributor's own
// global git config.
function syncGitAttributes() {
  const START = `# my-stack:gitattributes:start`
  const END = `# my-stack:gitattributes:end`
  const wrapped = `${START}\n# Managed by @lxtzfr/my-stack-core — re-run \`npx my-stack-sync-conventions\` to refresh.\n* text=auto eol=lf\n${END}`

  const path = join(targetRoot, '.gitattributes')
  const wasExisting = existsSync(path)
  if (syncManagedBlock(path, START, END, wrapped)) {
    console.log(`[my-stack-core] ${wasExisting ? 'updated' : 'created'} line-ending rule in ${path}`)
  }
}

// Binary assets committed straight into git bloat clone size and diff
// noise forever, even after deletion — Git LFS stores them as pointers
// instead. Consuming projects tend to forget to turn this on until it's
// already too late for some file, so wire it up automatically: track a
// generic set of binary extensions and initialize LFS's git hooks.
function syncGitLfs() {
  const START = `# my-stack:gitattributes-lfs:start`
  const END = `# my-stack:gitattributes-lfs:end`
  const patterns = [
    '*.png', '*.jpg', '*.jpeg', '*.gif', '*.webp', '*.ico', '*.psd', '*.ai',
    '*.mp3', '*.wav', '*.mp4', '*.mov', '*.webm',
    '*.ttf', '*.otf', '*.woff', '*.woff2',
    '*.pdf', '*.zip',
  ]
  const rules = patterns.map((p) => `${p} filter=lfs diff=lfs merge=lfs -text`).join('\n')
  const wrapped = `${START}\n# Managed by @lxtzfr/my-stack-core — re-run \`npx my-stack-sync-conventions\` to refresh.\n${rules}\n${END}`

  const path = join(targetRoot, '.gitattributes')
  const wasExisting = existsSync(path)
  if (syncManagedBlock(path, START, END, wrapped)) {
    console.log(`[my-stack-core] ${wasExisting ? 'updated' : 'created'} LFS tracking rules in ${path}`)
  }

  try {
    execSync('git lfs install', { cwd: targetRoot, stdio: 'ignore' })
  } catch {
    console.warn(`[my-stack-core] git-lfs not found — install it (https://git-lfs.com) then run \`git lfs install\` in ${targetRoot}`)
  }
}

function main() {
  if (process.env.CI) return // don't rewrite files unexpectedly in CI
  if (`${targetRoot}${sep}`.includes(`${sep}node_modules${sep}`)) return // safety net

  for (const kitPkgName of installedKitNames()) syncClaudeMd(kitPkgName)
  syncGitAttributes()
  syncGitLfs()
}

main()
