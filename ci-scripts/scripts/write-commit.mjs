#!/usr/bin/env node
// Runs as this package's `prepare` script — which a git-hosted dependency's package manager
// (pnpm/npm/yarn) always runs once, right after cloning and before packing the tarball that
// actually lands in a consumer's node_modules. At that point `.git` still exists (it gets
// stripped on pack), so this is the only moment we can capture "which commit is this install
// actually built from" — see shared/update-check.mjs, which reads .commit.json back out to
// compare against the latest commit on `main`.
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url))); // ci-scripts/

try {
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  writeFileSync(join(root, '.commit.json'), JSON.stringify({ commit }));
} catch {
  // Not a git checkout (e.g. `prepare` re-run against an already-packed install with no .git) —
  // leave whatever .commit.json is already there, if any; update-check.mjs treats a missing file
  // the same as "can't tell, skip the check".
}
