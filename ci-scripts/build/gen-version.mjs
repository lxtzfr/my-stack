#!/usr/bin/env node
import { fileURLToPath } from 'node:url'

// Human-readable, timestamp-based — NOT deterministic across invocations for the same commit.
// Services use this as their app-visible version (BUILD_VERSION / -bundleVersion); none of them
// can use it as an "already built" cache key (see docker-service-build.mjs / build-apk.mjs, which
// key on a commit-sha suffix instead).
function prettyVersion(env) {
  const now = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return {
    timestamp: now.getTime(),
    pretty: `${env}-${now.getFullYear()}.${pad(now.getMonth() + 1)}.${pad(now.getDate())}-${pad(now.getHours())}.${pad(now.getMinutes())}`,
  }
}

// Android requires each Play Store upload to carry a strictly increasing versionCode, capped at
// 2,100,000,000. Unix epoch minutes satisfies both without querying the registry for the last
// published value — fits under the cap until year ~5983 (vs. ~2036 for epoch seconds). Two builds
// within the same minute would collide, but a mobile build takes several minutes. Services that
// don't need a versionCode (server/web) just ignore this field.
function nextVersionCode() {
  return Math.floor(Date.now() / 60_000)
}

// `contractVersion` (optional — a project's semver from `contracts.<project>.versionFile`, see
// readContractVersion() in shared/utils.mjs) becomes the semver core, with pretty/env/timestamp
// riding along as build metadata (`+`) — informational only, per semver's own spec, so it never
// affects version comparison. `full` is what's meant to reach humans (BUILD_VERSION,
// -bundleVersion, package version): e.g. `1.0.0+dev-2026.09.20-22.33`. Without a contractVersion,
// `full` just falls back to `pretty` — this stays optional for a project with no `contracts` entry.
export function genVersion(env, contractVersion = null) {
  const { timestamp, pretty } = prettyVersion(env)
  const full = contractVersion ? `${contractVersion}+${pretty}` : pretty
  return { timestamp, pretty, full, versionCode: nextVersionCode(), env }
}

// CLI entrypoint: node build/gen-version.mjs <env> [contractVersion]
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const env = process.argv[2]
  if (!env) {
    console.error('Usage: gen-version.mjs <env> [contractVersion]')
    process.exit(1)
  }
  const version = genVersion(env, process.argv[3] ?? null)
  console.error(`version -> ${version.full} [${env}] versionCode: ${version.versionCode}`)
  process.stdout.write(JSON.stringify(version) + '\n')
}
