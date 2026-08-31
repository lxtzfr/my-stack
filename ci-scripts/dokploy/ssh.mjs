#!/usr/bin/env node
// Opens an interactive SSH session to the VPS — same `dokploy.sshHost` seed.mjs already uses, just
// without a command attached, for "I want a shell on the box" (poking at /etc/dokploy/logs,
// checking disk space, whatever doesn't have its own command here).
// Usage: node dokploy/ssh.mjs
import { run } from '../shared/utils.mjs';
import { loadConfig } from '../shared/config.mjs';

const config = await loadConfig();
const sshHost = config.dokploy?.sshHost;
if (!sshHost) {
  console.error('Set `dokploy.sshHost` in ci-scripts.config.mjs to use ssh.mjs');
  process.exit(1);
}

run(['ssh', sshHost]);
