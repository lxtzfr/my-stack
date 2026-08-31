#!/usr/bin/env node
// Re-pushes a service's env var VALUES (dokploySetup.composeServices[].envVars) to Dokploy.
// setup-env.mjs only calls compose.saveEnvironment once, at first provisioning (compose.create) —
// there's no other verb that re-syncs env var values afterwards, so secret/config rotation (e.g. a
// rotated API token in the local .env) silently never reaches the running container. compose-sync.mjs
// only diffs the compose FILE, not the env store, so it doesn't catch this either.
//
// Diffs against Dokploy's currently-stored env (compose.one's `env` field) the same way
// compose-sync.mjs diffs the compose file, so it's cheap and safe to call on every build — see
// docker-service-build.mjs, which does exactly that automatically for any service with a matching
// dokploySetup.composeServices entry. No per-service config needed to opt in/out: a service simply
// isn't in dokploySetup.composeServices if it doesn't want this.
//
// Requires DOKPLOY_TOKEN. Env must already be provisioned (see setup-env.mjs).
// Usage: node dokploy/env-sync.mjs <service> <env>
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dokploy } from './dokploy.mjs';
import { resolveComposeApp } from './resolve-compose.mjs';
import { loadConfig } from '../shared/config.mjs';

/** Returns true if env vars had drifted and were pushed + redeployed, false if already current or
 *  this service has no dokploySetup.composeServices entry (soft no-op — see docker-service-build.mjs,
 *  which calls this unconditionally for every build). Pass `required: true` (the CLI entrypoint
 *  below does) to throw instead of silently no-op'ing when misconfigured. */
export async function syncEnv(service, env, { required = false } = {}) {
  const config = await loadConfig();
  const projectName = config.dokploy?.projectName;
  if (!projectName) {
    if (required) throw new Error('Set `dokploy.projectName` in ci-scripts.config.mjs');
    return false;
  }
  const svc = config.dokploySetup?.composeServices?.find(s => s.name === service);
  if (!svc?.envVars) {
    if (required) throw new Error(`No dokploySetup.composeServices entry named "${service}" with envVars`);
    return false;
  }

  let environment, compose, current;
  try {
    ({ environment, compose, composeDetail: current } = await resolveComposeApp(service, env));
  } catch (error) {
    if (required) throw error;
    return false;
  }

  // Mirrors setup-env.mjs's envVars(env, ctx) call — db is only resolved if this env actually
  // provisioned a postgres resource, so services with no `db.*` interpolation in envVars work
  // without one.
  let db = null;
  if (config.dokploySetup.postgres) {
    const existingPostgres = environment.postgres ?? [];
    const pg = existingPostgres.find(p => p.name === `postgres-${env}`);
    if (pg) db = await dokploy.postgresOne(pg.postgresId);
  }

  const desiredEnv = svc.envVars(env, { db, randomUUID });
  if (current.env === desiredEnv) return false;

  console.log(`${service}-${env}: env vars drifted from Dokploy — pushing and redeploying...`);
  await dokploy.composeSaveEnvironment({ composeId: compose.composeId, env: desiredEnv });
  await dokploy.composeDeploy(compose.composeId);
  return true;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [service, env] = process.argv.slice(2);
  if (!service || !env) {
    console.error('Usage: node dokploy/env-sync.mjs <service> <env>');
    process.exit(1);
  }
  const pushed = await syncEnv(service, env, { required: true });
  console.log(pushed ? 'Done — env vars were out of date, pushed and redeployed.' : 'Done — nothing to push.');
}
