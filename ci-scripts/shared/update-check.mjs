// Best-effort "you're behind main" nudge for the CLI. There's no build/publish step for this
// package (see package.json) — it's consumed straight from a git commit, resolved by pnpm to
// `.../tar.gz/<commit>#path:ci-scripts` in the consumer's own pnpm-lock.yaml. That commit is the
// one reliable signal for "what's actually installed": a prepare script can't capture it instead,
// because pnpm's `#path:` resolution runs build scripts against an extracted tarball (no `.git`),
// so `git rev-parse HEAD` there always fails.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { findWorkspaceRoot } from './config.mjs';

const REPO_URL = 'https://github.com/lxtzfr/my-stack.git';
const LOCKFILE_ENTRY = /@lxtzfr\/my-stack-ci-scripts@https:\/\/codeload\.github\.com\/lxtzfr\/my-stack\/tar\.gz\/([0-9a-f]{40})#path:ci-scripts/;
// Global, not per-project: the check is about which commit of the *package* is installed, not
// about anything project-specific, so every project sharing this machine shares one cache/cooldown
// instead of each re-checking (and re-notifying) independently.
const CACHE_FILE = join(homedir(), '.cache', 'lxtzfr-ci-scripts', 'update-check.json');
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

function installedCommit() {
  const root = findWorkspaceRoot();
  const lockfile = join(root, 'pnpm-lock.yaml');
  if (!existsSync(lockfile)) return null;
  return readFileSync(lockfile, 'utf8').match(LOCKFILE_ENTRY)?.[1] ?? null;
}

function remoteMainCommit() {
  const r = spawnSync('git', ['ls-remote', REPO_URL, 'main'], { encoding: 'utf8' });
  if (r.status !== 0 || !r.stdout) return null;
  return r.stdout.split('\t')[0]?.trim() || null;
}

function readCache() {
  try {
    return JSON.parse(readFileSync(CACHE_FILE, 'utf8'));
  } catch {
    return null;
  }
}

function writeCache(data) {
  try {
    mkdirSync(dirname(CACHE_FILE), { recursive: true });
    writeFileSync(CACHE_FILE, JSON.stringify(data));
  } catch {
    // best-effort — a stale/missing cache just means the next run checks again
  }
}

/** Prints a one-line notice to stderr when the consumer's pnpm-lock.yaml pins an older commit
 *  than the latest on `main`. Never throws and never blocks: no lockfile, offline, no git, a
 *  broken cache dir, or GitHub being down all just skip the check silently — this is a
 *  convenience nudge, not something any real command should ever fail or slow down over.
 *  Rate-limited to once per CHECK_INTERVAL_MS via a cache file, so most invocations don't touch
 *  the network at all. */
export function checkForUpdates() {
  try {
    const installed = installedCommit();
    if (!installed) return;

    const cache = readCache();
    const isFresh = cache && Date.now() - cache.checkedAt < CHECK_INTERVAL_MS;
    const remote = isFresh ? cache.remoteCommit : remoteMainCommit();
    if (!remote) return;

    if (!isFresh) writeCache({ checkedAt: Date.now(), remoteCommit: remote });

    if (remote !== installed) {
      console.error(
        `\n⚠ ci-scripts is out of date (installed ${installed.slice(0, 10)}, latest ${remote.slice(0, 10)}) — run \`pnpm update @lxtzfr/my-stack-ci-scripts\`.\n`,
      );
    }
  } catch {
    // never let the update check break an actual command
  }
}
