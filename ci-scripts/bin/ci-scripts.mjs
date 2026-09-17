#!/usr/bin/env node
// Single CLI entrypoint dispatching to the individual scripts, so a consuming project only needs
// one bin on its PATH (`pnpm exec ci-scripts <command> ...`) instead of long node/path invocations.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { checkForUpdates } from '../shared/update-check.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(__dirname);

checkForUpdates();

const commands = {
  'bump':                 'build/bump-version.mjs',
  'build':                'build/build-service.mjs',
  'build-apk':            'build/build-apk.mjs',
  'build-sub-image':      'build/build-sub-image.mjs',
  'build-all':            'build/build-all.mjs',
  'gen-version':          'build/gen-version.mjs',
  'verify-deploy':        'build/verify-deploy.mjs',
  'dokploy-setup-env':    'dokploy/setup-env.mjs',
  'dokploy-seed':         'dokploy/seed.mjs',
  'dokploy-compose-sync': 'dokploy/compose-sync.mjs',
  'dokploy-env-sync':     'dokploy/env-sync.mjs',
  'dokploy-ssh':          'dokploy/ssh.mjs',
  'dokploy-logs':         'dokploy/logs.mjs',
};

const [command, ...args] = process.argv.slice(2);
const script = commands[command];
if (!script) {
  console.error(`Usage: ci-scripts <command> [...args]\n\nCommands:\n${Object.keys(commands).map(c => `  ${c}`).join('\n')}`);
  process.exit(1);
}

const r = spawnSync(process.execPath, [join(ROOT, script), ...args], { stdio: 'inherit' });
process.exit(r.status ?? 1);
