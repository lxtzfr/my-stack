#!/usr/bin/env node
// Assumes `ci-scripts bump <service> <env>` already ran, for services that have a `bump` entry.
// Builds/pushes/deploys any docker-built service defined in ci-scripts.config.mjs's `services`
// map: content-addressed skip check, push, Dokploy compose sync + deploy trigger, deploy
// verification, back to main. Generic in place of separate build-server.mjs/build-web.mjs scripts
// — those only ever differed in webhooks, health check URL, and build steps, all of which are
// config now.
//
// A service with no matching `bump` entry is built straight off whatever's checked out (typically
// main) instead of a deploy/<env> branch — for single-repo / single-env projects that don't want
// the branch-per-env ceremony.
// Usage: node build/build-service.mjs <service> [env] [--force]
import { join } from 'node:path';
import { run, capture } from '../shared/utils.mjs';
import { assertClean, assertBumped, assertUpstreamReady } from '../shared/publish-guard.mjs';
import { verifyServiceDeploy } from './verify-deploy.mjs';
import { buildAndDeployDockerService } from './docker-service-build.mjs';
import { genVersion } from './gen-version.mjs';
import { loadConfig } from '../shared/config.mjs';
import { makeLogger } from '../shared/log.mjs';

const config = await loadConfig();
const { workspaceRoot, configDir, envs, services = {}, bump = {} } = config;
const deployEnvs = Object.keys(envs).filter(e => e !== 'loc');

const args = process.argv.slice(2);
const force = args.includes('--force');
const positional = args.filter(a => a !== '--force');
const service = positional[0];
const env = positional[1] ?? 'prd';

if (!services[service]) {
  console.error(`Unknown service '${service}' — must be one of: ${Object.keys(services).join(', ')}`);
  process.exit(1);
}
if (!deployEnvs.includes(env)) {
  console.error(`env must be one of: ${deployEnvs.join(', ')}`); process.exit(1);
}

const svc = services[service];
const dir = svc.dir ?? service;
const log = makeLogger(service, env);
log.step('Starting build');

if (bump[service]) {
  assertBumped(join(workspaceRoot, dir), service, env);
} else {
  assertClean(join(workspaceRoot, dir), service);
}
const looseUpstream = (svc.looseUpstreamEnvs ?? []).includes(env);
for (const upstream of svc.upstream ?? []) {
  assertUpstreamReady(join(workspaceRoot, services[upstream]?.dir ?? upstream), upstream, env, { loose: looseUpstream });
}

const versionTag = genVersion(env).pretty;

await buildAndDeployDockerService({
  service,
  dir,
  env,
  workspaceRoot,
  configDir,
  log,
  versionTag,
  webhookUrl: svc.webhooks?.[env],
  verify: (env, versionTag) => verifyServiceDeploy(service, env, versionTag),
  dockerBuildArgs: svc.dockerBuildArgs?.(env, config) ?? {},
  // Forwarded straight to `docker buildx build --ssh`, e.g. 'default' (agent) or
  // 'default=/path/to/key' (raw key file, no agent needed) — for a Dockerfile whose build needs
  // to fetch a private git-hosted dependency (see ci-scripts.config.example.mjs).
  dockerSsh: svc.dockerSsh,
  // Override when the Dockerfile/docker-compose.yml don't live at their <dir>-relative default
  // (e.g. grouped under a ci-scripts/ folder instead) — all relative to workspaceRoot.
  dockerfilePath: svc.dockerfilePath ? join(workspaceRoot, svc.dockerfilePath) : undefined,
  contextDir: svc.contextDir ? join(workspaceRoot, svc.contextDir) : undefined,
  composeFilePath: svc.composeFilePath,
  force,
  runBuild: () => svc.build({ run, capture, env, versionTag, log, config }),
});
