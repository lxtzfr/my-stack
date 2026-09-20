import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const IS_WIN = process.platform === 'win32';

/** Arg names whose value is a secret when passed as `NAME=value` (docker `--build-arg`, env
 *  assignments...). Matched loosely: a token can be called GITHUB_TOKEN, GH_PAT, CF_DNS_API_TOKEN... */
const SECRET_NAME = /(TOKEN|SECRET|PASSWORD|PASSWD|_PAT|^PAT|APIKEY|API_KEY|CREDENTIAL|PRIVATE_KEY)/i;

/** Literal secret values registered by callers, masked wherever they appear in an echoed command. */
const knownSecrets = new Set();

/** Register a resolved secret so `run`'s echo never prints it, whatever arg carries it. Callers
 *  that read a token out of the env (or `gh auth token`) should call this as soon as they have it —
 *  SECRET_NAME only catches secrets that happen to travel under a self-describing name. */
export function registerSecret(value) {
  if (typeof value === 'string' && value.trim().length >= 8) knownSecrets.add(value.trim());
}

/** The command line as it gets echoed, with secrets masked. Echoing the raw argv leaks any token
 *  passed inline (e.g. `--build-arg GITHUB_TOKEN=gho_...`) into build logs, terminal scrollback and
 *  CI output, where it long outlives the run. */
export function redactCommand(args) {
  return args
    .map(arg => {
      const i = arg.indexOf('=');
      const masked = i > 0 && SECRET_NAME.test(arg.slice(0, i)) ? `${arg.slice(0, i)}=***` : arg;
      let out = masked;
      for (const secret of knownSecrets) if (out.includes(secret)) out = out.split(secret).join('***');
      return out;
    })
    .join(' ');
}

/** Run a command with inherited stdio. Exits on failure. */
export function run(args, opts = {}) {
  const [bin, ...rest] = args;
  console.log(`$ ${redactCommand([bin, ...rest])}`);
  const { input, ...spawnOpts } = opts;
  const stdio = input !== undefined ? ['pipe', 'inherit', 'inherit'] : 'inherit';
  const r = spawnSync(bin, rest, { stdio, input, shell: IS_WIN, ...spawnOpts });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

/** Run a command and return trimmed stdout. */
export function capture(args) {
  const [bin, ...rest] = args;
  const r = spawnSync(bin, rest, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], shell: IS_WIN });
  return (r.stdout || '').trim();
}


/** First entry in `list` ending with `suffix`, or undefined. Used for the "already built" checks:
 *  the build identity (commit sha, or sha combo) is a suffix on the real published tag/version
 *  name, since the human-readable part of that name is a fresh timestamp on every invocation and
 *  can't be reconstructed on a retry. */
export function findBySuffix(list, suffix) {
  return list.find(item => item.endsWith(suffix));
}

/** Prints a boxed key/value recap, same style as build-all.mjs's summary table. Called by each
 *  build script right before it exits, so the recap is guaranteed regardless of who's watching —
 *  not something reconstructed from scattered STEP/SKIP log lines after the fact. */
export function printRecap(title, rows) {
  console.log(`\n${'='.repeat(70)}\n${title}\n${'='.repeat(70)}`);
  const width = Math.max(12, ...rows.map(([label]) => String(label).length));
  for (const [label, value] of rows) console.log(`  ${String(label).padEnd(width)} ${value}`);
}

/** Writes a build script's recap alongside printRecap's console output, so build-all.mjs can
 *  read it back and fold version/identity details into its own final summary — instead of just
 *  "built"/"up to date", one place ends up with everything worth copy-pasting after a run.
 *  `configDir` is config.configDir (the consumer's ci-scripts/ folder) — recaps are ci-scripts-
 *  owned state, grouped there alongside config.mjs/.env rather than loose at the workspace root. */
export function writeRecap(configDir, key, data) {
  const dir = join(configDir, '.builds', 'recaps');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${key}.json`), JSON.stringify(data, null, 2));
}

/** Reads back what writeRecap() wrote, or null if it's missing (build step failed before writing it). */
export function readRecap(configDir, key) {
  try {
    return JSON.parse(readFileSync(join(configDir, '.builds', 'recaps', `${key}.json`), 'utf8'));
  } catch {
    return null;
  }
}

/** Parse GitLab namespace from a git remote URL. */
export function parseNamespace(remote) {
  const m = remote.match(/gitlab\.com[:/](.+)\/[^/]+$/);
  if (!m) throw new Error(`Cannot parse GitLab namespace from remote: ${remote}`);
  return m[1];
}

/** Resolve a GitLab project ID from namespace + repo name via glab. */
export function resolveProjectId(namespace, repoName) {
  const id = JSON.parse(capture(['glab', 'api', `projects/${namespace}%2F${repoName}`])).id;
  if (!id) throw new Error(`Could not resolve project ID for ${namespace}/${repoName}`);
  return id;
}

/** Reads a project's semver contract version (contracts.<project>.versionFile), or null if that
 *  project has no `contracts` entry — genVersion()'s contractVersion param is optional for exactly
 *  this reason, so a project that hasn't adopted a contract version yet still gets a plain version. */
/** Reads a `{"version": "X.Y.Z"}` file directly, given its containing directory — the primitive
 *  `readContractVersion` builds on for a `services`-map project. Exported separately for a caller
 *  with no `services` entry to resolve a dir from (e.g. a sub-image, keyed by its own `dir` in
 *  `subImages` instead). */
export function readContractVersionAt(repoDir, versionFile) {
  if (!versionFile) return null
  const versionFilePath = resolve(repoDir, versionFile)
  if (!existsSync(versionFilePath)) return null
  return JSON.parse(readFileSync(versionFilePath, 'utf8')).version ?? null
}

export function readContractVersion(config, project) {
  const projectConfig = config.contracts?.[project]
  if (!projectConfig) return null
  const repoDir = resolve(config.workspaceRoot, config.services?.[project]?.dir ?? project)
  return readContractVersionAt(repoDir, projectConfig.versionFile)
}

/** Switch repoDir back to main. Call at the end of a build script so it never stays on deploy/<env>. */
export function checkoutMain(repoDir) {
  run(['git', 'checkout', 'main'], { cwd: repoDir });
  // Discard tracked-file changes a build may have left behind (e.g. BuildScript.BuildAPK
  // writing env values into BuildConfig.cs / ProjectSettings.asset) — git checkout alone
  // carries non-conflicting local modifications forward instead of resetting them.
  run(['git', 'restore', '.'], { cwd: repoDir });
}
