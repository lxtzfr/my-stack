#!/usr/bin/env node
// Single CLI entrypoint, same dispatch shape as ci-scripts' bin.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(__dirname);

const commands = {
  init: 'scripts/init.mjs',
};

const [command, ...args] = process.argv.slice(2);
const script = commands[command];
if (!script) {
  console.error(`Usage: dev-env <command> [...args]\n\nCommands:\n${Object.keys(commands).map(c => `  ${c}`).join('\n')}`);
  process.exit(1);
}

const r = spawnSync(process.execPath, [join(ROOT, script), ...args], { stdio: 'inherit' });
process.exit(r.status ?? 1);
