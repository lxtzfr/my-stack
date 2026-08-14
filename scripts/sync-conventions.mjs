#!/usr/bin/env node
// Injects/updates kit-web's managed blocks into the *consuming* project — a
// one-line pointer at conventions/CLAUDE.md into that project's own
// CLAUDE.md, and a line-ending rule into its .gitattributes. The CLAUDE.md
// block is a pointer, not a copy of the actual conventions text: git only
// reads .gitattributes from the repo it's operating on so that one has to be
// real content, but an AI coding assistant that already reads the consuming
// project's own CLAUDE.md will follow a plain-text instruction inside it to
// go read another file — including one under node_modules — so there's
// nothing to keep in sync there. (This wasn't always a pointer: it used to
// copy the whole block, which meant every kit-web update required a
// re-sync in every consuming project just to pick up wording changes.)
// Runs automatically on `npm/pnpm install` (see package.json's postinstall)
// so every project that depends on kit-web picks these up without manual
// copy-pasting, and stays re-runnable (`npx kit-web-sync-conventions`) for
// a direct invocation.
//
// Each block is delimited by its own START/END markers so re-running only
// touches kit-web's own block, leaving the rest of the file alone — and so
// it's idempotent (running it twice in a row is a no-op, not a duplicate
// block).

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, sep } from 'node:path'

// Lifecycle scripts run with cwd inside node_modules/kit-web — INIT_CWD is
// npm/pnpm's own env var for "where the top-level install was actually run
// from" (the consuming project's root). Falls back to cwd for a direct
// `npx kit-web-sync-conventions` invocation, where INIT_CWD isn't set but
// cwd already *is* the right place.
const targetRoot = process.env.INIT_CWD || process.cwd()

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

function syncClaudeMd() {
  const START = '<!-- kit-web:conventions:start -->'
  const END = '<!-- kit-web:conventions:end -->'
  const wrapped = `${START}\n<!-- Managed by kit-web. -->\n\nFor architectural conventions shared across kit-web projects (server/client/lib/rpc folder\norganization, contributing fixes back to kit-web, etc.), read\n\`node_modules/kit-web/conventions/CLAUDE.md\`.\n${END}`

  const path = join(targetRoot, 'CLAUDE.md')
  const wasExisting = existsSync(path)
  if (syncManagedBlock(path, START, END, wrapped)) {
    console.log(`[kit-web] ${wasExisting ? 'updated' : 'created'} conventions pointer in ${path}`)
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
  const START = '# kit-web:gitattributes:start'
  const END = '# kit-web:gitattributes:end'
  const wrapped = `${START}\n# Managed by kit-web — re-run \`npx kit-web-sync-conventions\` to refresh.\n* text=auto eol=lf\n${END}`

  const path = join(targetRoot, '.gitattributes')
  const wasExisting = existsSync(path)
  if (syncManagedBlock(path, START, END, wrapped)) {
    console.log(`[kit-web] ${wasExisting ? 'updated' : 'created'} line-ending rule in ${path}`)
  }
}

function main() {
  if (process.env.CI) return // don't rewrite files unexpectedly in CI
  if (`${targetRoot}${sep}`.includes(`${sep}node_modules${sep}`)) return // safety net

  syncClaudeMd()
  syncGitAttributes()
}

main()
