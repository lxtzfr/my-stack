#!/usr/bin/env node
// Builds/pushes a docker image that has no repo/branch/version-bump cycle of its own — instead
// content-hash-keyed off a directory (e.g. a Dockerfile + large static assets that barely change),
// nested under a parent service's registry namespace and Dokploy webhook/compose. Defined in
// ci-scripts.config.mjs's `subImages` map. Generic in place of what used to be a one-off
// build-tts.mjs.
// Usage: node build/build-sub-image.mjs <name> [env] [--force]
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { findBySuffix, printRecap, writeRecap } from '../shared/utils.mjs';
import { dockerLogin, dockerBuildPush, cleanupOldTags, listImageTags, resolveRegistry } from './docker-registry.mjs';
import { triggerDeploy } from './docker-service-build.mjs';
import { loadConfig } from '../shared/config.mjs';
import { makeLogger } from '../shared/log.mjs';
import { hasToken } from '../dokploy/dokploy.mjs';
import { syncCompose } from '../dokploy/compose-sync.mjs';

const config = await loadConfig();
const { workspaceRoot, configDir, envs, subImages = {}, services = {} } = config;
const deployEnvs = Object.keys(envs).filter(e => e !== 'loc');

const args = process.argv.slice(2);
const force = args.includes('--force');
const positional = args.filter(a => a !== '--force');
const name = positional[0];
const env = positional[1] ?? 'prd';

const sub = subImages[name];
if (!sub) {
  console.error(`Unknown sub-image '${name}' — must be one of: ${Object.keys(subImages).join(', ')}`);
  process.exit(1);
}
if (!deployEnvs.includes(env)) {
  console.error(`env must be one of: ${deployEnvs.join(', ')}`); process.exit(1);
}

const log = makeLogger(name, env);
log.step('Starting build');

const dir = join(workspaceRoot, sub.dir);

/** Hashes every file's relative path + content under `d`, so the result changes iff something in
 *  the directory actually changed — not on every unrelated commit elsewhere in the repo. */
function hashDir(d) {
  const hash = createHash('sha256');
  for (const entry of readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    hash.update(entry.name);
    const full = join(d, entry.name);
    if (entry.isDirectory()) hash.update(hashDir(full));
    else hash.update(readFileSync(full));
  }
  return hash.digest('hex');
}
const contentHash = hashDir(dir).slice(0, 10);

// docker-registry.mjs's `project` param is a checkout dir relative to workspaceRoot — resolve the
// parent service's own `dir` override (e.g. '.' for a single-repo project) rather than assuming
// its services-map key doubles as its checkout dir.
const project = services[sub.parentService]?.dir ?? sub.parentService;
// Prefixed with the repo's own name — see docker-service-build.mjs's imagePath for why.
const { repoName } = resolveRegistry(project);
const imagePath = `${repoName}/${sub.parentService}/${name}/${env}`;
const versionTag = env;

const foundTag = findBySuffix(listImageTags({ project, imagePath }), `-${contentHash}`);
const matchedTag = force ? undefined : foundTag;
const registryTag = matchedTag ?? `${versionTag}-${contentHash}`;

if (matchedTag) {
  log.skip(`${matchedTag} already in the registry for ${name}/${env} — build/push/cleanup skipped.`);
} else {
  if (force && foundTag) log.warn(`--force: rebuilding despite ${foundTag} already in the registry.`);
  dockerLogin(project);
  dockerBuildPush({ project, env, versionTag, registryTag, imagePath, dockerfilePath: join(dir, 'Dockerfile'), contextDir: dir });
  cleanupOldTags({ project, imagePath });
  log.step(`Built and pushed ${registryTag} (+ latest).`);
}

const webhookUrl = services[sub.parentService]?.webhooks?.[env];
let deployAction = 'not configured (no webhook for this env)';
if (webhookUrl) {
  let composeDeployed = false;
  if (hasToken()) {
    log.step('Checking Dokploy compose is up to date...');
    const parentSvc = services[sub.parentService];
    const composeFilePath = parentSvc?.composeFilePath ?? join(parentSvc?.dir ?? sub.parentService, 'docker-compose.yml');
    composeDeployed = await syncCompose(sub.parentService, env, composeFilePath);
  } else {
    log.warn('DOKPLOY_TOKEN not set — skipping Dokploy compose sync check.');
  }
  // Nothing to deploy when the image was already built and compose didn't change — trigger would
  // just reboot containers for no reason.
  if (!composeDeployed && !matchedTag) {
    triggerDeploy(webhookUrl);
    deployAction = 'triggered';
  } else if (composeDeployed) {
    deployAction = 'compose sync redeployed';
  } else {
    log.skip('Nothing new to deploy — skipping trigger.');
    deployAction = 'skipped (nothing new)';
  }
}

const status = matchedTag ? 'up to date (skipped)' : 'built and pushed';
printRecap(`Result: ${name} [${env}]`, [
  ['status', status],
  ['registry tag', registryTag],
  ['deploy', deployAction],
]);
writeRecap(configDir, `${name}-${env}`, { service: name, env, status, identity: registryTag, deploy: deployAction });

log.done(matchedTag ? `already built (${matchedTag})` : `built and pushed ${registryTag}`);
if (matchedTag) process.exitCode = 2;
