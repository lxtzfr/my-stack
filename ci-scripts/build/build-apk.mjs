#!/usr/bin/env node
// Builds + pushes a Unity Android build as a GitLab generic package, config-driven via
// ci-scripts.config.mjs's `apk` block. Unity Editor must be closed before running.
// Usage: node build/build-apk.mjs [env] [--force]
import { mkdirSync, statSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { run, capture, parseNamespace, resolveProjectId, checkoutMain, findBySuffix, printRecap, writeRecap, readContractVersion, versionBookkeepingPaths } from '../shared/utils.mjs';
import { cleanupOldPackages, listPackageVersions, pruneOldPackageFiles } from './gitlab-packages.mjs';
import { assertBumped, assertUpstreamReady, assertGeneratedClientFresh, assertContractBumped } from '../shared/publish-guard.mjs';
import { genVersion } from './gen-version.mjs';
import { loadConfig } from '../shared/config.mjs';
import { makeLogger } from '../shared/log.mjs';

const config = await loadConfig();
const { workspaceRoot, configDir, envs, apk } = config;
if (!apk) { console.error('No `apk` block in ci-scripts.config.mjs'); process.exit(1); }

const bumpProject  = apk.bumpProject ?? 'unity';
const UNITY_PROJECT = join(workspaceRoot, apk.unityProjectDir);
const ASSET_PROJECT = apk.assetProjectDir ? join(workspaceRoot, apk.assetProjectDir) : null;
const OUTPUT_DIR    = join(configDir, '.builds');
const APK_NAME       = apk.fileName;

const force = process.argv.includes('--force');
const env = process.argv.find(a => Object.keys(apk.envs).includes(a)) ?? Object.keys(apk.envs)[0];
const log = makeLogger(bumpProject, env);
log.step('Starting build');

assertBumped(UNITY_PROJECT, bumpProject, env);
if (apk.upstream) {
  const loose = (apk.looseUpstreamEnvs ?? []).includes(env);
  assertUpstreamReady(join(workspaceRoot, apk.upstream), apk.upstream, env, { loose });
}
assertContractBumped(UNITY_PROJECT, bumpProject, config.contracts?.[bumpProject], versionBookkeepingPaths(config, UNITY_PROJECT));

if (apk.apiClientFreshness) {
  log.step('Checking generated API clients are up to date...');
  if (apk.specGenCommand) run(apk.specGenCommand);
  assertGeneratedClientFresh({ workspaceRoot, ...apk.apiClientFreshness });
}

const unityRemote = capture(['git', '-C', UNITY_PROJECT, 'remote', 'get-url', 'origin']);
const NAMESPACE  = parseNamespace(unityRemote);
const REPO_NAME  = unityRemote.replace(/\.git$/, '').split(/[:/]/).pop();
const PROJECT_ID = resolveProjectId(NAMESPACE, REPO_NAME);
const PACKAGE    = `${apk.packagePrefix}-${env}`;

// Content-addressed identity: skip the (several-minute) build if this exact content was already
// built for this env. versionCode isn't known ahead of a real build so the exact version string
// can't be reconstructed on a retry, but a stable identity known ahead of time is enough to search
// the registry for.
//
// When a contract is configured, assertContractBumped (above) already refuses to proceed if a
// single file in this repo changed since the last bump-contract commit — so the contract's semver
// core alone (e.g. `1.0.1`) is already unique per content, and it's already embedded as the prefix
// of displayVersion (`1.0.1+dev-...`) below — no separate marker or commit hash needed. Fall back
// to hashing commits, appended as an explicit suffix, when there's no contract to lean on, or when
// a separate asset repo (apk.assetProjectDir, a UPM git dependency pinned to assetBranch)
// contributes content assertContractBumped's repo-local diff can't see.
const contractVersion = readContractVersion(config, bumpProject);
const useContractIdentity = Boolean(contractVersion) && !ASSET_PROJECT;

let shaIdentity = null;
if (!useContractIdentity) {
  const unitySha = capture(['git', '-C', UNITY_PROJECT, 'rev-parse', '--short=10', 'HEAD']);
  shaIdentity = unitySha;
  if (ASSET_PROJECT) {
    run(['git', '-C', ASSET_PROJECT, 'fetch', 'origin', apk.assetBranch]);
    const assetSha = capture(['git', '-C', ASSET_PROJECT, 'rev-parse', '--short=10', `origin/${apk.assetBranch}`]);
    shaIdentity = `${unitySha}-${assetSha}`;
  }
}

const versions = listPackageVersions({ projectId: PROJECT_ID, packageName: PACKAGE, limit: 20 });
const foundVersion = useContractIdentity
  ? versions.find(v => v.startsWith(`${contractVersion}+`))
  : findBySuffix(versions, `-${shaIdentity}`);
const matchedVersion = force ? undefined : foundVersion;

if (force && foundVersion) log.warn(`--force: rebuilding despite ${foundVersion} already in the registry.`);

if (matchedVersion) {
  log.skip(`${useContractIdentity ? contractVersion : shaIdentity} already built as ${PACKAGE}/${matchedVersion} — build skipped.`);
  checkoutMain(UNITY_PROJECT);
  const skipDownloadUrl = `https://gitlab.com/api/v4/projects/${PROJECT_ID}/packages/generic/${PACKAGE}/latest/${APK_NAME}`;
  printRecap(`Result: ${bumpProject} [${env}]`, [
    ['status', 'up to date (skipped)'],
    ['package version', matchedVersion],
    ['download', skipDownloadUrl],
  ]);
  writeRecap(configDir, `${bumpProject}-${env}`, { service: bumpProject, env, status: 'up to date (skipped)', version: matchedVersion, identity: matchedVersion, download: skipDownloadUrl });
  log.done(`already built (${matchedVersion})`);
  // Distinct from a plain success — lets build-all.mjs's summary say "up to date" instead of "built".
  process.exit(2);
}

const cfg        = apk.envs[env];
const apiBaseUrl = envs[env].apiHost;

function keystoreArgs() {
  if (!apk.keystore) return [];
  const pass = process.env[apk.keystore.passEnv];
  const path = join(workspaceRoot, apk.keystore.path);
  if (!pass || !existsSync(path)) return [];
  return ['-keystorePath', path, '-keystorePass', pass, '-keyAlias', apk.keystore.alias, '-keyAliasPass', pass];
}

log.step('Generating version...');
const { versionCode, full: displayVersion } = genVersion(env, contractVersion);

const projectVersionTxt = readFileSync(join(UNITY_PROJECT, 'ProjectSettings', 'ProjectVersion.txt'), 'utf8');
const UNITY_VERSION = projectVersionTxt.match(/^m_EditorVersion:\s*(.+)$/m)?.[1]?.trim();
if (!UNITY_VERSION) { log.error('Cannot resolve Unity version'); process.exit(1); }

const UNITY_EXE = `C:\\Program Files\\Unity\\Hub\\Editor\\${UNITY_VERSION}\\Editor\\Unity.exe`;
if (!existsSync(UNITY_EXE)) { log.error(`Unity not found: ${UNITY_EXE}`); process.exit(1); }

mkdirSync(join(OUTPUT_DIR, env), { recursive: true });
const APK_PATH = join(OUTPUT_DIR, env, APK_NAME);

// The pushed package version matches -bundleVersion (app-visible, matches server/web's
// BUILD_VERSION format exactly, e.g. `1.0.0+dev-2026.09.20-22.33`) — already lexically sortable via
// its embedded date, and, when useContractIdentity is true, already carrying the content identity
// checked for above via its `1.0.1+` prefix. Otherwise the sha identity rides along as an explicit
// suffix, since it isn't embedded anywhere else in the string. versionCode itself is only passed to
// Android via -versionCode, its own required strictly-increasing integer field; it doesn't need to
// also ride along in the registry version.
const packageVersion = useContractIdentity ? displayVersion : `${displayVersion}-${shaIdentity}`;

log.step(`Building [${env}] v${versionCode} (${displayVersion})...`);
run([
  UNITY_EXE,
  '-batchmode', '-quit',
  '-projectPath', UNITY_PROJECT,
  '-buildTarget', 'Android',
  '-executeMethod', apk.buildMethod,
  '-outputPath', APK_PATH,
  '-bundleId', cfg.bundleId,
  '-appName', cfg.appName,
  '-versionCode', String(versionCode),
  '-bundleVersion', displayVersion,
  ...(apk.buildArgs ? apk.buildArgs(config, env) : []),
  ...(cfg.dev ? ['-debuggable'] : []),
  ...keystoreArgs(),
  '-logFile', '-',
], { shell: false });

log.step(`Built: ${APK_PATH} (${(statSync(APK_PATH).size / 1024 / 1024).toFixed(1)}M)`);

log.step(`Pushing to GitLab (project ${PROJECT_ID})...`);
run(['glab', 'api', '-X', 'PUT', `projects/${PROJECT_ID}/packages/generic/${PACKAGE}/${packageVersion}/${APK_NAME}`, '--input', APK_PATH]);
run(['glab', 'api', '-X', 'PUT', `projects/${PROJECT_ID}/packages/generic/${PACKAGE}/latest/${APK_NAME}`,            '--input', APK_PATH]);
// 'latest' is re-pushed on every real build — GitLab appends rather than overwrites, so prune
// the older files it leaves behind under that same version.
pruneOldPackageFiles({ projectId: PROJECT_ID, packageName: PACKAGE, version: 'latest', fileName: APK_NAME });

cleanupOldPackages({ projectId: PROJECT_ID, packageName: PACKAGE });

const downloadUrl = `https://gitlab.com/api/v4/projects/${PROJECT_ID}/packages/generic/${PACKAGE}/latest/${APK_NAME}`;
log.step(`Download: ${downloadUrl}`);

checkoutMain(UNITY_PROJECT);

printRecap(`Result: ${bumpProject} [${env}]`, [
  ['status', 'built and pushed'],
  ['version', displayVersion],
  ['package version', packageVersion],
  ['download', downloadUrl],
]);
writeRecap(configDir, `${bumpProject}-${env}`, { service: bumpProject, env, status: 'built and pushed', version: displayVersion, identity: packageVersion, download: downloadUrl });

log.done(`v${versionCode} [${env}]`);
