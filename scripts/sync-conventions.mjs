#!/usr/bin/env node
// Injects/updates kit-web's conventions block (conventions/CLAUDE.md) into
// the *consuming* project's own CLAUDE.md — never into node_modules, since
// Claude Code only reads CLAUDE.md files from the project tree it's
// actually working in, not from inside a dependency. Runs automatically on
// `npm/pnpm install` (see package.json's postinstall) so every project that
// depends on kit-web picks up the current conventions without manual
// copy-pasting, and stays re-runnable (`npx kit-web-sync-conventions`) so a
// `kit-web` version bump can be re-applied without a full reinstall.
//
// Delimited by START/END markers so re-running only touches kit-web's own
// block, leaving the rest of the project's CLAUDE.md alone — and so it's
// idempotent (running it twice in a row is a no-op, not a duplicate block).

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, dirname, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const START = '<!-- kit-web:conventions:start -->'
const END = '<!-- kit-web:conventions:end -->'

// Lifecycle scripts run with cwd inside node_modules/kit-web — INIT_CWD is
// npm/pnpm's own env var for "where the top-level install was actually run
// from" (the consuming project's root). Falls back to cwd for a direct
// `npx kit-web-sync-conventions` invocation, where INIT_CWD isn't set but
// cwd already *is* the right place.
const targetRoot = process.env.INIT_CWD || process.cwd()

function main() {
  if (process.env.CI) return // don't rewrite files unexpectedly in CI
  if (`${targetRoot}${sep}`.includes(`${sep}node_modules${sep}`)) return // safety net

  const scriptDir = dirname(fileURLToPath(import.meta.url))
  const block = readFileSync(join(scriptDir, '..', 'conventions', 'CLAUDE.md'), 'utf-8').trim()
  const wrapped = `${START}\n<!-- Managed by kit-web — re-run \`npx kit-web-sync-conventions\` after a\n     kit-web update to refresh this block. Edits outside the markers are\n     preserved; edits inside them are overwritten on the next sync. -->\n\n${block}\n${END}`

  const claudeMdPath = join(targetRoot, 'CLAUDE.md')
  const existing = existsSync(claudeMdPath) ? readFileSync(claudeMdPath, 'utf-8') : ''

  let next
  if (existing.includes(START) && existing.includes(END)) {
    const before = existing.slice(0, existing.indexOf(START))
    const after = existing.slice(existing.indexOf(END) + END.length)
    next = `${before}${wrapped}${after}`
  } else if (existing.trim().length > 0) {
    next = `${existing.trimEnd()}\n\n${wrapped}\n`
  } else {
    next = `${wrapped}\n`
  }

  if (next === existing) return // already up to date, avoid a needless write/log line

  writeFileSync(claudeMdPath, next, 'utf-8')
  console.log(`[kit-web] ${existing ? 'updated' : 'created'} conventions block in ${claudeMdPath}`)
}

main()
