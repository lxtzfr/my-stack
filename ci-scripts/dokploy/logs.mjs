#!/usr/bin/env node
// Fetches `docker logs` for a service's running container on the VPS via SSH, resolving the real
// Dokploy-assigned container name (`<appName>-<service>-1`, same naming seed.mjs's docker-exec
// already relies on) instead of asking you to know or guess it.
// Usage: node dokploy/logs.mjs <service> <env> [-- docker logs args, default: --tail 200]
//   node dokploy/logs.mjs web prd
//   node dokploy/logs.mjs web prd -- --follow
//   node dokploy/logs.mjs web prd -- --since 1h --tail 500
import { fileURLToPath } from 'node:url';
import { run } from '../shared/utils.mjs';
import { resolveComposeApp } from './resolve-compose.mjs';
import { loadConfig } from '../shared/config.mjs';

export async function fetchLogs(service, env, dockerArgs = ['--tail', '200']) {
  const config = await loadConfig();
  const sshHost = config.dokploy?.sshHost;
  if (!sshHost) throw new Error('Set `dokploy.sshHost` in ci-scripts.config.mjs to use logs.mjs');

  const { appName } = await resolveComposeApp(service, env);
  const container = `${appName}-${service}-1`;
  console.log(`Fetching logs for ${container}...`);
  // One shell string, not separate ssh argv entries — the remote shell (not this process) is what
  // needs to parse `docker logs --tail 200 <container>` as a single command.
  run(['ssh', sshHost, `sudo docker logs ${dockerArgs.join(' ')} ${container}`]);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [service, env, sep, ...rest] = process.argv.slice(2);
  if (!service || !env) {
    console.error('Usage: node dokploy/logs.mjs <service> <env> [-- docker logs args]');
    process.exit(1);
  }
  const dockerArgs = sep === '--' && rest.length ? rest : undefined;
  await fetchLogs(service, env, dockerArgs);
}
