import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { loadConfig } from '../shared/config.mjs';

const config = await loadConfig();
const ENV_FILE = join(config.configDir, '.env');
if (existsSync(ENV_FILE)) process.loadEnvFile(ENV_FILE);

// Checked lazily (not at import time) so scripts can import this module without requiring
// DOKPLOY_TOKEN unless they actually end up calling the API (e.g. build-service.mjs, which only
// syncs Dokploy compose when the token happens to be set).
export function hasToken() {
  return !!process.env.DOKPLOY_TOKEN;
}

async function call(method, path, body) {
  const baseUrl = process.env.DOKPLOY_URL ?? config.dokploy?.url;
  if (!baseUrl) { console.error('Set `dokploy.url` in ci-scripts.config.mjs, or DOKPLOY_URL.'); process.exit(1); }
  const token = process.env.DOKPLOY_TOKEN;
  if (!token) { console.error('DOKPLOY_TOKEN missing — set it in .env'); process.exit(1); }
  // Which organization a request operates against is baked into the API key itself at creation
  // time (Dokploy stores it in the key's own metadata, resolved server-side) — there is no
  // per-request header to switch it. On a multi-org Dokploy instance, generate the key while that
  // org is active in the dashboard; DOKPLOY_TOKEN then only ever sees that org's projects.
  const res = await fetch(`${baseUrl}/api/${path}`, {
    method,
    headers: { 'x-api-key': token, 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}

export const dokploy = {
  readTraefikConfig:   ()                  => call('GET',  'settings.readTraefikConfig'),
  updateTraefikConfig: (traefikConfig)     => call('POST', 'settings.updateTraefikConfig', { traefikConfig }),
  readTraefikEnv:      ()                  => call('GET',  'settings.readTraefikEnv'),
  writeTraefikEnv:     (env)               => call('POST', 'settings.writeTraefikEnv', { env }),
  updateTraefikFile:   (path, traefikConfig) => call('POST', 'settings.updateTraefikFile', { path, traefikConfig }),
  reloadTraefik:       ()                  => call('POST', 'settings.reloadTraefik', {}),

  projectAll:              ()             => call('GET',  'project.all'),
  environmentByProjectId:  (projectId)    => call('GET',  `environment.byProjectId?projectId=${projectId}`),
  environmentCreate:       (body)         => call('POST', 'environment.create', body),

  composeOne:           (composeId)       => call('GET',  `compose.one?composeId=${composeId}`),
  composeCreate:        (body)            => call('POST', 'compose.create', body),
  composeUpdate:        (body)            => call('POST', 'compose.update', body),
  composeDelete:        (body)            => call('POST', 'compose.delete', body),
  composeSaveEnvironment: (body)          => call('POST', 'compose.saveEnvironment', body),
  composeDeploy:        (composeId)       => call('POST', 'compose.deploy', { composeId }),

  domainCreate:         (body)            => call('POST', 'domain.create', body),
  domainByComposeId:    (composeId)       => call('GET',  `domain.byComposeId?composeId=${composeId}`),
  domainDelete:         (domainId)        => call('POST', 'domain.delete', { domainId }),

  postgresOne:          (postgresId)      => call('GET',  `postgres.one?postgresId=${postgresId}`),
  postgresCreate:       (body)            => call('POST', 'postgres.create', body),
  postgresDeploy:       (postgresId)      => call('POST', 'postgres.deploy', { postgresId }),
};
