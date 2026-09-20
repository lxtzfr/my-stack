import { join } from 'node:path';
import { run, capture, checkoutMain, findBySuffix, printRecap, writeRecap } from '../shared/utils.mjs';
import { dockerLogin, dockerBuildPush, cleanupOldTags, listImageTags, resolveRegistry } from './docker-registry.mjs';
import { hasToken } from '../dokploy/dokploy.mjs';
import { syncCompose } from '../dokploy/compose-sync.mjs';
import { syncEnv } from '../dokploy/env-sync.mjs';

export function triggerDeploy(webhookUrl) {
  console.log('Triggering deploy...');
  run(['curl', '-s', '-X', 'GET', webhookUrl]);
}

/** Shared build/push/deploy/verify pipeline for any docker-built service: content-addressed skip
 *  check, push, compose sync + deploy trigger, deploy verification, and returning to main.
 *  `dir` (defaults to `service`) is the filesystem/git checkout this service lives in, relative to
 *  workspaceRoot — override it when the logical service name differs from its directory (e.g. a
 *  single-repo project where the repo root itself is the service, `dir: '.'`). */
export async function buildAndDeployDockerService({
  service, dir = service, env, workspaceRoot, configDir = workspaceRoot, log, versionTag, webhookUrl,
  runBuild,          // () => void — runs the actual pre-build steps + `pnpm build` for this service
  dockerBuildArgs = {},
  dockerSsh,         // forwarded to `docker buildx build --ssh`, see build-service.mjs
  dockerfilePath,    // absolute path, defaults to <workspaceRoot>/<dir>/Dockerfile
  contextDir,        // absolute path, defaults to workspaceRoot
  composeFilePath,   // relative to workspaceRoot, defaults to <dir>/docker-compose.yml
  verify,            // (env, versionTag) => Promise<void>
  force = false,     // bypass the already-built skip check and rebuild/push/deploy regardless
}) {
  const repoDir = join(workspaceRoot, dir);
  // Exactly 3 path segments below the registry host, always: <namespace>/<repoName>/<name> —
  // GitLab's container registry rejects creating a new repository path beyond a certain nesting
  // depth (confirmed: 4 segments total succeeds, 5 fails with "insufficient_scope"), so nothing
  // below `repoName` is ever its own path segment — `service` and `env` fold into one dash-joined
  // name instead of a `service/env` sub-path. `repoName` itself still guards against collision
  // across repos under the same registry owner that happen to name a service the same way (this
  // repo's `web` and some other repo's `web` would otherwise silently share one tag).
  const { repoName } = resolveRegistry(dir);
  const imagePath = `${repoName}/${service}-${env}`;

  // Content-addressed identity: if this exact commit was already built for this env, skip the
  // rebuild entirely — bump-version.mjs already refuses to bump twice without a
  // new commit on main, but the build script itself can still be re-run against the same bump
  // commit. The commit sha lives as a suffix on the real pushed tag (no separate marker tag).
  const commitSha = capture(['git', '-C', repoDir, 'rev-parse', '--short=10', 'HEAD']);
  const foundTag = findBySuffix(listImageTags({ project: dir, imagePath }), `-${commitSha}`);
  const matchedTag = force ? undefined : foundTag;
  // Docker tag references only allow [a-zA-Z0-9_.-] — versionTag's "+" (semver build metadata,
  // see gen-version.mjs) is invalid there even though it's fine in BUILD_VERSION/labels, which
  // aren't constrained the same way.
  const registryTag = matchedTag ?? `${versionTag.replace(/\+/g, '-')}-${commitSha}`;

  if (matchedTag) {
    log.skip(`${matchedTag} already in the registry for ${service}/${env} — build/push/cleanup skipped.`);
  } else {
    if (force && foundTag) log.warn(`--force: rebuilding despite ${foundTag} already in the registry.`);
    runBuild();

    dockerLogin(dir);
    dockerBuildPush({ project: dir, env, versionTag, registryTag, buildArgs: dockerBuildArgs, ssh: dockerSsh, imagePath, dockerfilePath, contextDir });
    cleanupOldTags({ project: dir, imagePath });
    log.step(`Built and pushed ${registryTag} (+ latest).`);
  }

  let deployAction = 'not configured (no webhook for this env)';
  let verifyAction = 'skipped';
  if (webhookUrl) {
    let composeDeployed = false;
    let envSynced = false;
    if (hasToken()) {
      log.step('Checking Dokploy compose is up to date...');
      composeDeployed = await syncCompose(service, env, composeFilePath ?? join(dir, 'docker-compose.yml'));
      // Best-effort (no throw if this service has no dokploySetup.composeServices entry) — keeps
      // env var VALUES (secrets/config) honest on every build, not just at first provisioning. See
      // env-sync.mjs for why that gap existed.
      log.step('Checking Dokploy env vars are up to date...');
      envSynced = await syncEnv(service, env);
    } else {
      log.warn('DOKPLOY_TOKEN not set — skipping Dokploy compose/env sync check.');
    }
    // Nothing to deploy when the image was already built and neither compose nor env changed —
    // trigger would just reboot containers for no reason.
    if (!composeDeployed && !envSynced && !matchedTag) {
      triggerDeploy(webhookUrl);
      deployAction = 'triggered';
    } else if (composeDeployed || envSynced) {
      deployAction = [composeDeployed && 'compose', envSynced && 'env'].filter(Boolean).join('+') + ' sync redeployed';
    } else {
      log.skip('Nothing new to deploy — skipping trigger.');
      deployAction = 'skipped (nothing new)';
    }
    // A skipped build means versionTag was never actually pushed — nothing new to verify against.
    if (!matchedTag) {
      await verify(env, versionTag);
      log.step(`Verified live deploy reports version ${versionTag}.`);
      verifyAction = `confirmed live at ${versionTag}`;
    } else {
      log.skip('Deploy verification skipped — no new image was pushed.');
      verifyAction = 'skipped (no new image)';
    }
  }

  checkoutMain(repoDir);

  const status = matchedTag ? 'up to date (skipped)' : 'built and pushed';
  // versionTag is a fresh timestamp on every invocation (see gen-version.mjs) — on the skip path
  // it doesn't reflect what's actually live, so recover the real one from the matched tag instead.
  const displayVersion = matchedTag ? matchedTag.replace(/-[0-9a-f]{10}$/, '') : versionTag;
  printRecap(`Result: ${service} [${env}]`, [
    ['status', status],
    ['version', displayVersion],
    ['registry tag', registryTag],
    ['deploy', deployAction],
    ['verify', verifyAction],
  ]);
  writeRecap(configDir, `${service}-${env}`, { service, env, status, version: displayVersion, identity: registryTag, deploy: deployAction, verify: verifyAction });

  log.done(matchedTag ? `already built (${matchedTag})` : `built and deployed ${versionTag}`);
  // Distinct from a plain success — lets build-all.mjs's summary say "up to date" instead of "built".
  if (matchedTag) process.exitCode = 2;
}
