#!/usr/bin/env node
// Pushes a service's docker-compose.yml to Dokploy if it drifted from what's currently stored
// there, and redeploys. Requires DOKPLOY_TOKEN. Env must already be provisioned (see setup-env.mjs).
// Usage: node dokploy/compose-sync.mjs <service> <env> [composeFilePath]
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { dokploy } from './dokploy.mjs';
import { resolveComposeApp } from './resolve-compose.mjs';
import { loadConfig } from '../shared/config.mjs';

// Polls compose.one until Dokploy's own composeStatus leaves "error"/settles, so a broken deploy
// (bad image ref, failed pull, ...) surfaces here with an actionable pointer to the real log file
// instead of only showing up ~2 minutes later as a generic verify-deploy.mjs health-check timeout
// that gives no clue why. See /etc/dokploy/logs/<appName>/ on the VPS for the full Docker output.
async function waitForDeployStatus(composeId, appName, { timeoutMs = 60000, intervalMs = 3000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const current = await dokploy.composeOne(composeId);
    if (current.composeStatus === 'error') {
      throw new Error(
        `Dokploy compose deploy failed for "${appName}" (composeStatus=error). ` +
        `Check /etc/dokploy/logs/${appName}/ on the VPS for the real Docker error ` +
        `(common cause: an image tag referenced by docker-compose.yml was never pushed).`
      );
    }
    if (current.composeStatus === 'done') return;
    await new Promise(r => setTimeout(r, intervalMs));
  }
  // Not necessarily a failure — Dokploy may just not have picked up the deploy yet. Don't throw;
  // verify-deploy.mjs's health-check timeout remains the final word on whether this actually landed.
  console.warn(`${appName}: composeStatus didn't settle to "done" within ${timeoutMs}ms — deploy may still be in progress.`);
}

// Returns true if the compose had drifted (or was still in an error state from a previous run) and
// was pushed + redeployed, false if it was already current. `composeFilePath` (relative to the
// workspace root) defaults to `<service>/docker-compose.yml` — the multi-repo convention — but
// callers that know the real path (setup-env.mjs's `composeFile`, or a single-repo service's `dir`)
// should always pass it explicitly.
export async function syncCompose(service, env, composeFilePath = join(service, 'docker-compose.yml')) {
  const config = await loadConfig();
  const { compose, composeDetail: current } = await resolveComposeApp(service, env);

  const composeFile = readFileSync(join(config.workspaceRoot, composeFilePath), 'utf8');
  const drifted = current.composeFile !== composeFile;

  if (!drifted && current.composeStatus !== 'error') {
    console.log(`${service}-${env}: compose already up to date.`);
    return false;
  }

  if (!drifted) {
    console.log(`${service}-${env}: compose file matches, but a previous deploy is in an error state — retrying...`);
  } else {
    console.log(`${service}-${env}: compose drifted from Dokploy — pushing and redeploying...`);
    await dokploy.composeUpdate({ composeId: compose.composeId, sourceType: 'raw', composeFile });
  }
  await dokploy.composeDeploy(compose.composeId);
  await waitForDeployStatus(compose.composeId, current.appName);
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
