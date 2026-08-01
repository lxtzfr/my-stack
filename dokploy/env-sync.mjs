#!/usr/bin/env node
// Re-pushes a service's env var VALUES (dokploySetup.composeServices[].envVars) to Dokploy.
// setup-env.mjs only calls compose.saveEnvironment once, at first provisioning (compose.create) —
// there's no other verb that re-syncs env var values afterwards, so secret/config rotation (e.g. a
// rotated API token in the local .env) silently never reaches the running container. compose-sync.mjs
// only diffs the compose FILE, not the env store, so it doesn't catch this either.
// Requires DOKPLOY_TOKEN. Env must already be provisioned (see setup-env.mjs).
// Usage: node dokploy/env-sync.mjs <service> <env>
import { fileURLToPath } from 'node:url';
import { dokploy } from './dokploy.mjs';
import { loadConfig } from '../shared/config.mjs';

export async function syncEnv(service, env) {
  const config = await loadConfig();
  const projectName = config.dokploy?.projectName;
  if (!projectName) throw new Error('Set `dokploy.projectName` in ci-scripts.config.mjs');
  const svc = config.dokploySetup?.composeServices?.find(s => s.name === service);
  if (!svc) throw new Error(`No dokploySetup.composeServices entry named "${service}"`);
  if (!svc.envVars) throw new Error(`dokploySetup.composeServices "${service}" has no envVars — nothing to sync`);

  const ENV_NAME = env === 'prd' ? 'production' : env;
  const projects = await dokploy.projectAll();
  const project = projects.find(p => p.name === projectName);
  if (!project) throw new Error(`${projectName} project not found`);
  const environments = await dokploy.environmentByProjectId(project.projectId);
  const environment = environments.find(e => e.name === ENV_NAME);
  if (!environment) throw new Error(`Environment "${ENV_NAME}" not found — run setup-env.mjs first`);

  const compose = (environment.compose ?? []).find(c => c.name === `${service}-${env}`);
  if (!compose) throw new Error(`No ${service}-${env} compose found — run setup-env.mjs first`);

  // Mirrors setup-env.mjs's envVars(env, ctx) call — db is only resolved if this env actually
  // provisioned a postgres resource, so services with no `db.*` interpolation in envVars work
  // without one.
  let db = null;
  if (config.dokploySetup.postgres) {
    const existingPostgres = environment.postgres ?? [];
    const pg = existingPostgres.find(p => p.name === `postgres-${env}`);
    if (pg) db = await dokploy.postgresOne(pg.postgresId);
  }

  await dokploy.composeSaveEnvironment({ composeId: compose.composeId, env: svc.envVars(env, { db, randomUUID: crypto.randomUUID }) });
  console.log(`${service}-${env}: env vars pushed — redeploying...`);
  await dokploy.composeDeploy(compose.composeId);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [service, env] = process.argv.slice(2);
  if (!service || !env) {
    console.error('Usage: node dokploy/env-sync.mjs <service> <env>');
    process.exit(1);
  }
  await syncEnv(service, env);
  console.log('Done.');
}
