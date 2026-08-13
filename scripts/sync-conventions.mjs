#!/usr/bin/env node
// Injects/updates kit-web's managed blocks into the *consuming* project —
// conventions/CLAUDE.md into that project's own CLAUDE.md, and a line-ending
// rule into its .gitattributes — never into node_modules, since tools like
// Claude Code only read CLAUDE.md files from the project tree they're
// actually working in, not from inside a dependency, and git only reads
// .gitattributes from the repo it's operating on. Runs automatically on
// `npm/pnpm install` (see package.json's postinstall) so every project that
// depends on kit-web picks these up without manual copy-pasting, and stays
// re-runnable (`npx kit-web-sync-conventions`) so a `kit-web` version bump
// can be re-applied without a full reinstall.
//
// Each block is delimited by its own START/END markers so re-running only
// touches kit-web's own block, leaving the rest of the file alone — and so
// it's idempotent (running it twice in a row is a no-op, not a duplicate
// block).

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, dirname, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

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

function syncClaudeMd(scriptDir) {
  const START = '<!-- kit-web:conventions:start -->'
  const END = '<!-- kit-web:conventions:end -->'
  const block = readFileSync(join(scriptDir, '..', 'conventions', 'CLAUDE.md'), 'utf-8').trim()
  const wrapped = `${START}\n<!-- Managed by kit-web — re-run \`npx kit-web-sync-conventions\` after a\n     kit-web update to refresh this block. Edits outside the markers are\n     preserved; edits inside them are overwritten on the next sync. -->\n\n${block}\n${END}`

  const path = join(targetRoot, 'CLAUDE.md')
  const wasExisting = existsSync(path)
  if (syncManagedBlock(path, START, END, wrapped)) {
    console.log(`[kit-web] ${wasExisting ? 'updated' : 'created'} conventions block in ${path}`)
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

  const scriptDir = dirname(fileURLToPath(import.meta.url))
  syncClaudeMd(scriptDir)
  syncGitAttributes()
}

main()
