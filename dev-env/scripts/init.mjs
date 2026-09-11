#!/usr/bin/env node
// Scaffolds Dockerfile.dev + docker-compose.dev.yml for the current project. Never overwrites an
// existing file — a project that already has one of these is left alone, with instructions
// printed for what to add by hand instead.
import { existsSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { execFileSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATES = join(dirname(__dirname), 'templates');
const CWD = process.cwd();

function arg(flag, fallback) {
  const i = process.argv.indexOf(flag);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

// `<org>-<repo>` from the git remote — a product typically gets its own GitHub org (e.g.
// `veezbot`, `lxtzfr-website`) holding generically-named repos (`server`, `web`, `robot`), so
// the org alone isn't always unique and the repo alone is rarely descriptive. package.json's
// `name` is a poor fallback source: it's often an internal/npm-scoped name that drifts from the
// repo's actual identity (e.g. package `lxtzfr-web` in the `lxtzfr-website/web` repo).
function nameFromGitRemote() {
  try {
    const url = execFileSync('git', ['remote', 'get-url', 'origin'], { cwd: CWD, stdio: ['ignore', 'pipe', 'ignore'] })
      .toString().trim();
    const match = url.match(/[:/]([^/:]+)\/([^/]+?)(\.git)?$/);
    if (!match) return null;
    const [, org, repo] = match;
    return `${org}-${repo}`;
  } catch {
    return null;
  }
}

function defaultName() {
  const fromGit = nameFromGitRemote();
  if (fromGit) return fromGit;
  const pkgPath = join(CWD, 'package.json');
  if (existsSync(pkgPath)) {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    if (pkg.name) return pkg.name.replace(/^@.*\//, '');
  }
  return CWD.split(/[\\/]/).pop();
}

const name = (arg('--name', defaultName()) ?? 'app').toLowerCase().replace(/[^a-z0-9-]/g, '-');
const port = arg('--port', '3000');

const dockerfileDest = join(CWD, 'Dockerfile.dev');
const composeDest = join(CWD, 'docker-compose.dev.yml');

if (existsSync(dockerfileDest)) {
  console.log(`Skipped Dockerfile.dev — already exists at ${dockerfileDest}`);
} else {
  copyFileSync(join(TEMPLATES, 'Dockerfile.dev'), dockerfileDest);
  console.log(`Created ${dockerfileDest}`);
}

const composeTemplate = readFileSync(join(TEMPLATES, 'docker-compose.dev.yml'), 'utf8')
  .replaceAll('__NAME__', name)
  .replaceAll('__PORT__', port);

if (existsSync(composeDest)) {
  console.log(`\nSkipped docker-compose.dev.yml — already exists at ${composeDest}.`);
  console.log(`Merge this service block in by hand if it isn't there yet:\n`);
  console.log(composeTemplate);
} else {
  writeFileSync(composeDest, composeTemplate);
  console.log(`Created ${composeDest}`);
}

console.log(`
Next steps:
  1. Make sure the shared Traefik stack is running (see dev-env/traefik/docker-compose.yml,
     started once for the whole machine).
  2. docker compose -f docker-compose.dev.yml up
  3. Open http://${name}.localhost
`);
