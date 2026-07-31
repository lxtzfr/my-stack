#!/usr/bin/env node
// Polls a deployed env until it reports the version that was just built, or times out. The health
// URL to poll comes from ci-scripts.config.mjs's `services[service].healthUrl(env, config)`.
// Usage: node build/verify-deploy.mjs <service> <env> <versionTag>
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../shared/config.mjs';

const POLL_INTERVAL_MS = 5_000;
const TIMEOUT_MS = 120_000;

async function poll(fetchVersion, expected) {
  const deadline = Date.now() + TIMEOUT_MS;
  let lastSeen = null;
  while (Date.now() < deadline) {
    try {
      lastSeen = await fetchVersion();
      if (lastSeen === expected) return true;
    } catch {
      // rollout in progress / not reachable yet — keep polling
    }
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
  }
  console.error(`Timed out after ${TIMEOUT_MS / 1000}s waiting for version '${expected}' — last seen: '${lastSeen}'`);
  return false;
}

export async function verifyServiceDeploy(service, env, versionTag) {
  const config = await loadConfig();
  const healthUrl = config.services?.[service]?.healthUrl;
  if (!healthUrl) throw new Error(`No services.${service}.healthUrl configured in ci-scripts.config.mjs`);
  const url = healthUrl(env, config);
  console.log(`Verifying ${service} [${env}] at ${url} reports version ${versionTag}...`);
  const ok = await poll(async () => {
    const res = await fetch(url);
    const body = await res.json();
    return body.version;
  }, versionTag);
  if (!ok) process.exit(1);
  console.log(`Verified — ${service} [${env}] is live at ${versionTag}.`);
}

// CLI entrypoint: node build/verify-deploy.mjs <service> <env> <versionTag>
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [service, env, versionTag] = process.argv.slice(2);
  if (!service || !env || !versionTag) {
    console.error('Usage: node build/verify-deploy.mjs <service> <env> <versionTag>');
    process.exit(1);
  }
  await verifyServiceDeploy(service, env, versionTag);
}
