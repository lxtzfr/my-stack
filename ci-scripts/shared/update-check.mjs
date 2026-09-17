// Best-effort "you're behind main" nudge for the CLI — see scripts/write-commit.mjs for how
// `.commit.json` (the installed copy's own commit) gets embedded at install time.
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PACKAGE_ROOT = dirname(dirname(fileURLToPath(import.meta.url))); // ci-scripts/
const REPO_URL = 'https://github.com/lxtzfr/my-stack.git';
// Global, not per-project: the check is about which commit of the *package* is installed, not
// about anything project-specific, so every project sharing this machine shares one cache/cooldown
// instead of each re-checking (and re-notifying) independently.
const CACHE_FILE = join(homedir(), '.cache', 'lxtzfr-ci-scripts', 'update-check.json');
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

function installedCommit() {
  try {
    return JSON.parse(readFileSync(join(PACKAGE_ROOT, '.commit.json'), 'utf8')).commit;
  } catch {
    return null; // no prepare script ever ran here (e.g. running straight out of a my-stack checkout)
  }
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

/** Prints a one-line notice to stderr when a newer commit than the installed one exists on
 *  `main`. Never throws and never blocks: offline, no git, a broken cache dir, or GitHub being
 *  down all just skip the check silently — this is a convenience nudge, not something any real
 *  command should ever fail or slow down over. Rate-limited to once per CHECK_INTERVAL_MS via a
 *  cache file, so most invocations don't touch the network at all. */
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
