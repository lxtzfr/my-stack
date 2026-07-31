#!/usr/bin/env node
// Runs the seed command inside a service's container on the VPS via SSH. Config-driven via
// ci-scripts.config.mjs's `dokploy.sshHost` and `dokploy.seedCommand`.
// Usage: node dokploy/seed.mjs <env>
import { run } from '../shared/utils.mjs';
import { dokploy } from './dokploy.mjs';
import { loadConfig } from '../shared/config.mjs';

const config = await loadConfig();
const { envs, dokploy: dokployConfig } = config;
const validEnvs = Object.keys(envs).filter(e => e !== 'loc');

const env = process.argv[2];
if (!validEnvs.includes(env)) {
  console.error(`env must be one of: ${validEnvs.join(', ')}`); process.exit(1);
}
if (!dokployConfig?.projectName) { console.error('Set `dokploy.projectName` in ci-scripts.config.mjs'); process.exit(1); }
if (!dokployConfig?.sshHost || !dokployConfig?.seedCommand) {
  console.error('Set `dokploy.sshHost` and `dokploy.seedCommand` in ci-scripts.config.mjs to use seed.mjs');
  process.exit(1);
}

const ENV_NAME = env === 'prd' ? 'production' : env;
const seedService = dokployConfig.seedService ?? 'server';

const projects = await dokploy.projectAll();
const project = projects.find(p => p.name === dokployConfig.projectName);
if (!project) throw new Error(`${dokployConfig.projectName} project not found`);
const environments = await dokploy.environmentByProjectId(project.projectId);
const environment = environments.find(e => e.name === ENV_NAME);
const seedCompose = environment?.compose.find(c => c.name === `${seedService}-${env}`);
if (!seedCompose) throw new Error(`${seedService}-${env} compose not found`);
const appName = (await dokploy.composeOne(seedCompose.composeId)).appName;

console.log(`Seeding [${env}] via ${appName}-${seedService}-1...`);
run(['ssh', dokployConfig.sshHost, dokployConfig.seedCommand(appName, env)]);
