import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

// Everything ci-scripts-owned (its own config, .env, build recaps) lives under one `ci-scripts/`
// folder in the consumer's project root, instead of scattered loose files — `config.mjs` is what
// findWorkspaceRoot() looks for to identify that root.
const CONFIG_DIR = 'ci-scripts';
const CONFIG_RELATIVE_PATH = join(CONFIG_DIR, 'config.mjs');

/** Walks up from `startDir` (default process.cwd()) looking for ci-scripts/config.mjs — the
 *  consumer project's root. Nothing here assumes where this package itself lives on disk, so it
 *  works the same whether ci-scripts is an npm dependency, a git submodule, or copied in. */
export function findWorkspaceRoot(startDir = process.cwd()) {
  let dir = startDir;
  while (true) {
    if (existsSync(join(dir, CONFIG_RELATIVE_PATH))) return dir;
    const parent = dirname(dir);
    if (parent === dir) {
      throw new Error(`Could not find ${CONFIG_RELATIVE_PATH} above ${startDir} — create one at your project root (see ci-scripts.config.example.mjs).`);
    }
    dir = parent;
  }
}

let cached = null;

/** Loads and caches the consumer's ci-scripts/config.mjs, tagged with the resolved workspaceRoot
 *  and configDir (the ci-scripts/ folder itself, for .env / build recaps / any other ci-scripts-
 *  owned file a consumer wants grouped alongside its config). */
export async function loadConfig() {
  if (cached) return cached;
  const root = findWorkspaceRoot();
  const configDir = join(root, CONFIG_DIR);
  const mod = await import(pathToFileURL(join(configDir, 'config.mjs')).href);
  cached = { ...mod.default, workspaceRoot: root, configDir };
  if (!cached.envs) throw new Error(`ci-scripts/config.mjs must export an \`envs\` map (see ci-scripts.config.example.mjs).`);
  return cached;
}
