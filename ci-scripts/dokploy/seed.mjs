#!/usr/bin/env node
// Runs the seed command inside a service's container on the VPS via SSH. Config-driven via
// ci-scripts.config.mjs's `dokploy.sshHost` and `dokploy.seedCommand`.
// Usage: node dokploy/seed.mjs <env>
import { run } from '../shared/utils.mjs';
import { resolveComposeApp } from './resolve-compose.mjs';
import { loadConfig } from '../shared/config.mjs';

const config = await loadConfig();
const { envs, dokploy: dokployConfig } = config;
const validEnvs = Object.keys(envs).filter(e => e !== 'loc');

const env = process.argv[2];
if (!validEnvs.includes(env)) {
  console.error(`env must be one of: ${validEnvs.join(', ')}`); process.exit(1);
}
if (!dokployConfig?.sshHost || !dokployConfig?.seedCommand) {
  console.error('Set `dokploy.sshHost` and `dokploy.seedCommand` in ci-scripts.config.mjs to use seed.mjs');
  process.exit(1);
}

const seedService = dokployConfig.seedService ?? 'server';
const { appName } = await resolveComposeApp(seedService, env);

console.log(`Seeding [${env}] via ${appName}-${seedService}-1...`);
run(['ssh', dokployConfig.sshHost, dokployConfig.seedCommand(appName, env)]);
