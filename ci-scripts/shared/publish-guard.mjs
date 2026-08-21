import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

function git(repoDir, args) {
  return execFileSync('git', args, { cwd: repoDir, encoding: 'utf8' }).trim();
}

// Refuses to proceed if repoDir has uncommitted changes — a build must only ever embed
// what's actually committed, never a stray local edit made after the bump.
export function assertClean(repoDir, project) {
  if (git(repoDir, ['status', '--porcelain'])) {
    console.error(`${project} has uncommitted changes — commit or discard them before building.`);
    process.exit(1);
  }
}

// Refuses to proceed unless repoDir is checked out on deploy/<env> at a bump commit,
// with no uncommitted changes on top of it.
// Run `ci-scripts bump <project> <env>` first to produce that branch.
export function assertBumped(repoDir, project, env) {
  assertClean(repoDir, project)
  const branch = git(repoDir, ['rev-parse', '--abbrev-ref', 'HEAD'])
  if (branch !== `deploy/${env}`) {
    console.error(`Not on deploy/${env} in ${project} (currently on '${branch}'). Run: ci-scripts bump ${project} ${env}`);
    process.exit(1);
  }
  const subject = git(repoDir, ['log', '-1', '--format=%s'])
  if (!subject.startsWith(`Bump ${project} to `)) {
    console.error(`HEAD of deploy/${env} in ${project} isn't a bump commit ('${subject}'). Re-run the bump script.`);
    process.exit(1);
  }
  console.log(`Verified ${project} is on deploy/${env} at '${subject}'.`);
}

// Refuses to proceed unless repoDir (an upstream project another build depends on — e.g. an API
// server another service generates a client against) is in a known, reviewable state: either its
// own deploy/<env> bump commit (same env), or main in sync with origin/main. Always clean.
// Prevents a downstream build from silently baking in whatever the upstream happens to be checked
// out to locally (a different env, a WIP branch...). Pass `loose: true` (e.g. for a dev env listed
// in services.<name>.looseUpstreamEnvs) to skip the branch-identity requirement entirely — useful
// when testing a downstream build against an upstream WIP branch — while still requiring it clean.
export function assertUpstreamReady(repoDir, project, env, { loose = false } = {}) {
  assertClean(repoDir, project)
  if (loose) {
    const branch = git(repoDir, ['rev-parse', '--abbrev-ref', 'HEAD'])
    console.log(`${project} is ready at '${branch}' (loose check for '${env}' — branch identity not enforced).`);
    return;
  }
  const branch = git(repoDir, ['rev-parse', '--abbrev-ref', 'HEAD'])
  if (branch === `deploy/${env}`) {
    const subject = git(repoDir, ['log', '-1', '--format=%s'])
    if (!subject.startsWith(`Bump ${project} to `)) {
      console.error(`HEAD of ${project}'s deploy/${env} isn't a bump commit ('${subject}'). Re-run: ci-scripts bump ${project} ${env}`);
      process.exit(1);
    }
    console.log(`${project} is ready at deploy/${env} ('${subject}').`);
    return;
  }
  if (branch === 'main') {
    git(repoDir, ['fetch', 'origin', 'main'])
    if (git(repoDir, ['rev-parse', 'main']) !== git(repoDir, ['rev-parse', 'origin/main']))
      { console.error(`${project}'s main is out of sync with origin/main — push/pull before building against it.`); process.exit(1); }
    console.log(`${project} is ready at main (in sync with origin/main).`);
    return;
  }
  console.error(`${project} must be on 'deploy/${env}' or 'main' to build against it (currently on '${branch}').`);
  process.exit(1);
}

// Refuses to proceed if a generated API client is stale relative to the upstream specs it was
// generated from, tracked via a lock file holding a hash of those specs. Config-driven: pass the
// lock file path, the spec files it hashes, and a hint command to regenerate.
export function assertGeneratedClientFresh({ workspaceRoot, lockFile, specFiles, regenerateHint }) {
  const lockPath = join(workspaceRoot, lockFile);
  if (!existsSync(lockPath)) {
    console.error(`No ${lockFile} — run: ${regenerateHint}`);
    process.exit(1);
  }
  const hash = createHash('sha256');
  for (const spec of specFiles) hash.update(readFileSync(join(workspaceRoot, spec)));
  const current = hash.digest('hex');
  const { sha256: locked } = JSON.parse(readFileSync(lockPath, 'utf8'));
  if (current !== locked) {
    console.error(`Generated API client is stale — upstream specs changed since the last generation. Run: ${regenerateHint} (then commit the changes).`);
    process.exit(1);
  }
  console.log(`Generated API client is up to date with upstream specs.`);
}
