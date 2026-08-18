#!/usr/bin/env node
// Warns (never fails) when the consuming project's installed
// @lxtzfr/my-stack-* packages are locked to an older commit than
// my-stack's current default branch — the git-dependency equivalent of
// `npm outdated`, which doesn't work here since these deps have no
// semver, just a commit pinned in the lockfile. Run from postinstall so
// it's automatic across every project instead of relying on remembering
// to check.

import { readFileSync, existsSync } from 'node:fs'
import { join, sep } from 'node:path'
import { execSync } from 'node:child_process'

const targetRoot = process.env.INIT_CWD || process.cwd()
const REPO = 'https://github.com/lxtzfr/my-stack'

function lockedCommits() {
  const lockPath = join(targetRoot, 'pnpm-lock.yaml')
  if (!existsSync(lockPath)) return []

  const lock = readFileSync(lockPath, 'utf-8')
  // Matches e.g. "resolution: {commit: 5a66a1e..., path: core, repo:
  // git@github.com:lxtzfr/my-stack.git, type: git}" — one per installed
  // kit, potentially several if kits were resolved with different peer
  // dep permutations, so dedupe.
  const matches = lock.matchAll(/resolution: \{commit: ([0-9a-f]{40}), .*repo: [^,]*lxtzfr\/my-stack\.git/g)
  return [...new Set([...matches].map((m) => m[1]))]
}

function latestRemoteCommit() {
  // Short timeout: offline or a slow network must never stall an install.
  const output = execSync(`git ls-remote ${REPO} HEAD`, { timeout: 3000, encoding: 'utf-8' })
  return output.split(/\s+/)[0]
}

function main() {
  if (process.env.CI) return
  if (`${targetRoot}${sep}`.includes(`${sep}node_modules${sep}`)) return // safety net

  const locked = lockedCommits()
  if (locked.length === 0) return // not on pnpm, or my-stack not installed

  let latest
  try {
    latest = latestRemoteCommit()
  } catch {
    return // offline or GitHub unreachable — stay silent, don't nag
  }

  const stale = locked.filter((commit) => commit !== latest)
  if (stale.length === 0) return

  // console.log, not console.warn: a SessionStart hook's stdout is what
  // gets surfaced back to Claude as context, so this has to land there to
  // be seen and relayed to the user — stderr wouldn't make it.
  console.log(
    `[my-stack] update available — locked at ${stale[0].slice(0, 7)}, latest is ${latest.slice(0, 7)}.\n` +
    `Run \`pnpm update @lxtzfr/my-stack-core @lxtzfr/my-stack-tanstack\` (or whichever kits you have) to pick it up.`,
  )
}

main()
