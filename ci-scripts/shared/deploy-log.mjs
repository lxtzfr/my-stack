import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const MAX_PUSH_ATTEMPTS = 3;
const ON_RECORDED_TIMEOUT_MS = 60_000;

function git(repoDir, args, { env, input, allowFail = false } = {}) {
  const r = spawnSync('git', args, { cwd: repoDir, encoding: 'utf8', env: { ...process.env, ...env }, input });
  if (r.status !== 0) {
    if (allowFail) return null;
    throw new Error(`git ${args.join(' ')}: ${(r.stderr || r.stdout || '').trim()}`);
  }
  return r.stdout.trim();
}

/** Keys sorted at both levels (env, then project) so a deploy only ever touches its own lines in a diff. */
function sortedDoc(doc) {
  return Object.fromEntries(
    Object.keys(doc).sort().map(e => [e, Object.fromEntries(Object.keys(doc[e]).sort().map(p => [p, doc[e][p]]))]),
  );
}

function commitOnce(repoDir, { branch, file, project, env, entry }) {
  git(repoDir, ['fetch', 'origin', branch], { allowFail: true }); // branch absent on the very first deploy
  const parent = git(repoDir, ['rev-parse', '--verify', '--quiet', `refs/remotes/origin/${branch}`], { allowFail: true });

  const current = parent ? git(repoDir, ['show', `${parent}:${file}`], { allowFail: true }) : null;
  const doc = current ? JSON.parse(current) : {};
  doc[env] = { ...doc[env], [project]: entry };
  const blob = git(repoDir, ['hash-object', '-w', '--stdin'], { input: JSON.stringify(sortedDoc(doc), null, 2) + '\n' });

  // Temp index + plumbing: builds the commit without ever touching the working tree, the current
  // branch or the user's uncommitted changes in that checkout.
  const tmp = mkdtempSync(join(tmpdir(), 'deploy-log-'));
  try {
    const indexEnv = { GIT_INDEX_FILE: join(tmp, 'index') };
    if (parent) git(repoDir, ['read-tree', parent], { env: indexEnv });
    git(repoDir, ['update-index', '--add', '--cacheinfo', `100644,${blob},${file}`], { env: indexEnv });
    const tree = git(repoDir, ['write-tree'], { env: indexEnv });
    const message = `Deploy ${project} [${env}] ${entry.build ?? entry.version ?? entry.sha}`;
    const commit = git(repoDir, ['commit-tree', tree, ...(parent ? ['-p', parent] : []), '-m', message]);
    git(repoDir, ['push', 'origin', `${commit}:refs/heads/${branch}`]);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

/** Optional `deployLog.onRecorded` (argv array, run from `repo`) — e.g. regenerate a page from the
 *  file just pushed. Best-effort like the record itself: a failure only warns. */
function runOnRecorded(command, repoDir, log) {
  if (!command?.length) return;
  const [bin, ...args] = command;
  const r = spawnSync(bin, args, { cwd: repoDir, encoding: 'utf8', timeout: ON_RECORDED_TIMEOUT_MS, shell: process.platform === 'win32' });
  if (r.status === 0) log.step(`Ran ${command.join(' ')}`);
  else log.warn(`${command.join(' ')} failed: ${(r.stderr || r.error?.message || 'exit ' + r.status).trim()}`);
}

/** Records what was just deployed in the shared `deployLog` file — one entry per `<env>.<project>`,
 *  overwritten in place (the file stays small; history is `git log -p` on the branch). Committed
 *  straight onto its own branch via git plumbing, never the checked-out one. Best-effort: a failure
 *  here warns but never fails the deploy that already succeeded. No-op without a `deployLog` block.
 *  `entry` is free-form (version, build, sha...); `at` is added here. */
export function recordDeploy(config, log, { project, env, ...entry }) {
  const cfg = config.deployLog;
  if (!cfg) return;
  const repoDir = resolve(config.workspaceRoot, cfg.repo);
  const branch = cfg.branch ?? 'deploys';
  const file = cfg.file ?? 'versions.json';
  const clean = Object.fromEntries(Object.entries({ ...entry, at: new Date().toISOString() }).filter(([, v]) => v != null));

  for (let attempt = 1; attempt <= MAX_PUSH_ATTEMPTS; attempt++) {
    try {
      commitOnce(repoDir, { branch, file, project, env, entry: clean });
      log.step(`Recorded ${project} [${env}] in ${branch}:${file}`);
      runOnRecorded(cfg.onRecorded, repoDir, log);
      return;
    } catch (err) {
      // A concurrent deploy moved the branch between our fetch and push — refetch and retry.
      if (attempt === MAX_PUSH_ATTEMPTS) log.warn(`Deploy log not updated (${err.message})`);
    }
  }
}
