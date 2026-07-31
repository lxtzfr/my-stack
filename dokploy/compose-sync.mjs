#!/usr/bin/env node
// Pushes a service's docker-compose.yml to Dokploy if it drifted from what's currently stored
// there, and redeploys. Requires DOKPLOY_TOKEN. Env must already be provisioned (see setup-env.mjs).
// Usage: node dokploy/compose-sync.mjs <service> <env> [composeFilePath]
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { dokploy } from './dokploy.mjs';
import { loadConfig } from '../shared/config.mjs';

async function resolveEnvironment(env) {
  const config = await loadConfig();
  const projectName = config.dokploy?.projectName;
  if (!projectName) throw new Error('Set `dokploy.projectName` in ci-scripts.config.mjs');
  const ENV_NAME = env === 'prd' ? 'production' : env;
  const projects = await dokploy.projectAll();
  const project = projects.find(p => p.name === projectName);
  if (!project) throw new Error(`${projectName} project not found`);
  const environments = await dokploy.environmentByProjectId(project.projectId);
  const environment = environments.find(e => e.name === ENV_NAME);
  if (!environment) throw new Error(`Environment "${ENV_NAME}" not found — run setup-env.mjs first`);
  return environment;
}

// Returns true if the compose had drifted and was pushed + redeployed, false if it was already
// current. `composeFilePath` (relative to the workspace root) defaults to `<service>/docker-
// compose.yml` — the multi-repo convention — but callers that know the real path (setup-env.mjs's
// `composeFile`, or a single-repo service's `dir`) should always pass it explicitly.
export async function syncCompose(service, env, composeFilePath = join(service, 'docker-compose.yml')) {
  const config = await loadConfig();
  const environment = await resolveEnvironment(env);
  const compose = (environment.compose ?? []).find(c => c.name === `${service}-${env}`);
  if (!compose) throw new Error(`No ${service}-${env} compose found — run setup-env.mjs first`);

  const composeFile = readFileSync(join(config.workspaceRoot, composeFilePath), 'utf8');
  const current = await dokploy.composeOne(compose.composeId);
  if (current.composeFile === composeFile) {
    console.log(`${service}-${env}: compose already up to date.`);
    return false;
  }

  console.log(`${service}-${env}: compose drifted from Dokploy — pushing and redeploying...`);
  await dokploy.composeUpdate({ composeId: compose.composeId, sourceType: 'raw', composeFile });
  await dokploy.composeDeploy(compose.composeId);
  return true;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [service, env, composeFilePath] = process.argv.slice(2);
  if (!service || !env) {
    console.error('Usage: node dokploy/compose-sync.mjs <service> <env> [composeFilePath]');
    process.exit(1);
  }
  const pushed = await syncCompose(service, env, composeFilePath);
  console.log(pushed ? 'Done — compose was out of date, pushed and redeployed.' : 'Done — nothing to push.');
}
