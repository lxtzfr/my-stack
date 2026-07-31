#!/usr/bin/env node
// Creates the composes for an env in the configured Dokploy project (config.dokploy.projectName),
// configures domains + an optional wildcard subdomain route, and deploys. Driven entirely by
// ci-scripts.config.mjs's `dokploySetup` block — see ci-scripts.config.example.mjs.
// Usage: node dokploy/setup-env.mjs <env>
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { dokploy } from './dokploy.mjs';
import { syncCompose } from './compose-sync.mjs';
import { loadConfig } from '../shared/config.mjs';

const config = await loadConfig();
const { workspaceRoot, envs, dokploy: dokployConfig, dokploySetup } = config;
if (!dokployConfig?.projectName) { console.error('Set `dokploy.projectName` in ci-scripts.config.mjs'); process.exit(1); }
if (!dokploySetup?.composeServices?.length) { console.error('Set `dokploySetup.composeServices` in ci-scripts.config.mjs to use setup-env.mjs'); process.exit(1); }

const env = process.argv[2];
const validEnvs = Object.keys(envs).filter(e => e !== 'loc');
if (!validEnvs.includes(env)) {
  console.error(`env must be one of: ${validEnvs.join(', ')}`); process.exit(1);
}

const CF_DNS_API_TOKEN = process.env.CF_DNS_API_TOKEN;
if (dokploySetup.wildcard && !CF_DNS_API_TOKEN) { console.error('CF_DNS_API_TOKEN missing — set it in .env'); process.exit(1); }

const { host } = envs[env];
const ENV_NAME = env === 'prd' ? 'production' : env;
const projectName = dokployConfig.projectName;
const appPrefix = projectName.toLowerCase();

// Step 1: find the project + target environment (create env if missing)
const projects = await dokploy.projectAll();
const project = projects.find(p => p.name === projectName);
if (!project) throw new Error(`${projectName} project not found`);

let environments = await dokploy.environmentByProjectId(project.projectId);
let environment = environments.find(e => e.name === ENV_NAME);
if (!environment) {
  console.log(`Creating environment "${ENV_NAME}"...`);
  environment = await dokploy.environmentCreate({ name: ENV_NAME, description: '', projectId: project.projectId });
}

const existing = environment.compose ?? [];
const findCompose = (name) => existing.find(c => c.name === name);
const existingPostgres = environment.postgres ?? [];

// Step 2: db (native Dokploy postgres resource), optional
let dbDetails = null;
if (dokploySetup.postgres) {
  const pg = dokploySetup.postgres;
  let db = existingPostgres.find(p => p.name === `postgres-${env}`);
  if (!db) {
    console.log('Creating postgres resource...');
    db = await dokploy.postgresCreate({
      name: `postgres-${env}`,
      appName: `${appPrefix}-postgres-${env}`,
      databaseName: pg.databaseName,
      databaseUser: pg.databaseUser,
      databasePassword: randomUUID(),
      dockerImage: pg.dockerImage,
      environmentId: environment.environmentId,
      description: null,
      serverId: null,
    });
    console.log('Deploying postgres...');
    await dokploy.postgresDeploy(db.postgresId);
  } else {
    console.log('postgres resource already exists, skipping create.');
  }
  // Dokploy appends a random suffix to appName regardless of what's requested
  dbDetails = await dokploy.postgresOne(db.postgresId);
}

// Step 3: composes + domains
const domainBase = {
  https: true,
  applicationId: null,
  previewDeploymentId: null,
  domainType: 'compose',
  internalPath: '/',
  path: '/',
  stripPath: false,
  middlewares: [],
  forwardAuthEnabled: false,
  customEntrypoint: null,
};

const composeResults = {};
for (const svc of dokploySetup.composeServices) {
  let compose = findCompose(`${svc.name}-${env}`);
  if (!compose) {
    console.log(`Creating ${svc.name} compose...`);
    compose = await dokploy.composeCreate({
      name: `${svc.name}-${env}`,
      description: null,
      environmentId: environment.environmentId,
      composeType: 'docker-compose',
      appName: `${appPrefix}-${env}-${svc.name}`,
      serverId: null,
      composeFile: readFileSync(join(workspaceRoot, svc.composeFile), 'utf8'),
    });
    // compose.create's input schema silently drops sourceType (not one of its picked fields) —
    // Dokploy always creates a new compose as sourceType 'github' (pull from a linked repo)
    // regardless of what we pass. Fix it up via compose.update right away, since we're pushing raw
    // content instead — syncCompose's later diff check only compares composeFile, so relying on it
    // to fix this would never fire on first provisioning (content already matches).
    await dokploy.composeUpdate({ composeId: compose.composeId, sourceType: 'raw' });
    console.log(`Setting ${svc.name} env vars...`);
    await dokploy.composeSaveEnvironment({
      composeId: compose.composeId,
      env: svc.envVars(env, { db: dbDetails, randomUUID }),
    });
  } else {
    console.log(`${svc.name} compose already exists — syncing compose file...`);
  }
  const synced = await syncCompose(svc.name, env, svc.composeFile);
  composeResults[svc.name] = { compose, synced };

  if (svc.domainHost) {
    // domainHost can return a single host or an array — multiple domains routed to the same
    // service (e.g. a host-based multi-tenant app), all sharing one cert resolver/port/service.
    const domainHosts = [].concat(svc.domainHost(host));
    const domains = await dokploy.domainByComposeId(compose.composeId);
    // Traefik middleware names (must be defined elsewhere, e.g. via a `traefik.http.middlewares.*`
    // label on the service in the compose file itself — see web/ci-scripts/docker-compose.yml's
    // `compress` label for an example). Kept in sync on every run, including for domains that
    // already exist, since domain.create only fires once at first provisioning.
    const desiredMiddlewares = svc.middlewares ?? [];
    for (const domainHost of domainHosts) {
      const existingDomain = domains.find(d => d.host === domainHost);
      if (existingDomain) {
        const current = existingDomain.middlewares ?? [];
        const inSync = current.length === desiredMiddlewares.length && current.every(m => desiredMiddlewares.includes(m));
        if (inSync) {
          console.log(`Domain ${domainHost} already exists and is up to date, skipping.`);
        } else {
          console.log(`Domain ${domainHost} exists — syncing middlewares (${current.join(', ') || 'none'} -> ${desiredMiddlewares.join(', ') || 'none'})...`);
          await dokploy.domainUpdate({
            domainId: existingDomain.domainId,
            host: existingDomain.host,
            path: existingDomain.path,
            port: existingDomain.port,
            customEntrypoint: existingDomain.customEntrypoint,
            https: existingDomain.https,
            certificateType: existingDomain.certificateType,
            customCertResolver: existingDomain.customCertResolver,
            serviceName: existingDomain.serviceName,
            domainType: existingDomain.domainType,
            internalPath: existingDomain.internalPath,
            stripPath: existingDomain.stripPath,
            forwardAuthEnabled: existingDomain.forwardAuthEnabled,
            middlewares: desiredMiddlewares,
          });
        }
        continue;
      }
      console.log(`Creating domain ${domainHost} -> ${svc.name}:${svc.port}...`);
      // certificateType must be 'custom' for Dokploy to actually honor customCertResolver — with
      // certificateType 'letsencrypt' it hardcodes the certresolver docker label to 'letsencrypt'
      // (the default global resolver) regardless of what customCertResolver says (confirmed against
      // Dokploy's own source, packages/server/src/utils/docker/domain.ts createDomainLabels).
      const cert = svc.certResolver
        ? { certificateType: 'custom', customCertResolver: svc.certResolver }
        : { certificateType: 'letsencrypt', customCertResolver: null };
      await dokploy.domainCreate({ ...domainBase, ...cert, host: domainHost, port: svc.port, composeId: compose.composeId, serviceName: svc.name, middlewares: desiredMiddlewares });
    }
  }
}

// Step 4: deploy composes that weren't already redeployed by syncCompose above
for (const [name, { compose, synced }] of Object.entries(composeResults)) {
  if (!synced) {
    console.log(`Deploying ${name}...`);
    await dokploy.composeDeploy(compose.composeId);
  }
}

// Step 5: wildcard subdomain routing (*.<host> -> target service), DNS-01 cert via Cloudflare — optional
if (dokploySetup.wildcard) {
  const { targetService, port } = dokploySetup.wildcard;
  const targetCompose = composeResults[targetService]?.compose;
  if (!targetCompose) throw new Error(`dokploySetup.wildcard.targetService '${targetService}' has no matching entry in composeServices`);

  console.log('Checking traefik.yml...');
  const traefikConfig = await dokploy.readTraefikConfig();
  if (!traefikConfig.includes('dnsChallenge')) {
    console.log('Switching to dnsChallenge (cloudflare)...');
    const updated = traefikConfig.replace(
      /(\s+)httpChallenge:\n\s+entryPoint: web/,
      '$1dnsChallenge:\n        provider: cloudflare\n        resolvers:\n          - "1.1.1.1:53"\n          - "8.8.8.8:53"'
    );
    if (updated === traefikConfig) throw new Error('Could not find httpChallenge block to replace');
    await dokploy.updateTraefikConfig(updated);
  } else {
    console.log('Traefik already using dnsChallenge.');
  }

  console.log('Checking Traefik env...');
  const traefikEnv = await dokploy.readTraefikEnv();
  if (!traefikEnv.includes('CF_DNS_API_TOKEN')) {
    console.log('Adding CF_DNS_API_TOKEN...');
    await dokploy.writeTraefikEnv(`${traefikEnv.trimEnd()}\nCF_DNS_API_TOKEN=${CF_DNS_API_TOKEN}\n`);
  } else {
    console.log('CF_DNS_API_TOKEN already set.');
  }

  const targetDetails = await dokploy.composeOne(targetCompose.composeId);
  console.log(`Writing wildcard config for *.${host} -> ${targetDetails.appName}-${targetService}-1:${port}...`);
  const wildcardConfig = `http:
  routers:
    wildcard-${env}:
      rule: 'HostRegexp(\`^[a-z0-9-]+\\.${host.replace(/\./g, '\\.')}$\`)'
      priority: 1
      entryPoints: ["websecure"]
      tls:
        certResolver: letsencrypt
        domains:
          - main: "${host}"
            sans:
              - "*.${host}"
      service: wildcard-${env}-${targetService}
  services:
    wildcard-${env}-${targetService}:
      loadBalancer:
        servers:
          - url: "http://${targetDetails.appName}-${targetService}-1:${port}"
`;
  await dokploy.updateTraefikFile(`/etc/dokploy/traefik/dynamic/wildcard-${env}.yml`, wildcardConfig);

  console.log('Reloading Traefik...');
  await dokploy.reloadTraefik();
}

const wildcardNote = dokploySetup.wildcard ? ` (wildcard *.${host} -> ${dokploySetup.wildcard.targetService})` : '';
console.log(`\nDone — ${env} is set up at https://${host}${wildcardNote}`);
