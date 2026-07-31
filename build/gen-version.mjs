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
    pretty: `${now.getFullYear()}.${pad(now.getMonth() + 1)}.${pad(now.getDate())}-${pad(now.getHours())}.${pad(now.getMinutes())}-${env}`,
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

export function genVersion(env) {
  const { timestamp, pretty } = prettyVersion(env)
  return { timestamp, pretty, versionCode: nextVersionCode(), env }
}

// CLI entrypoint: node build/gen-version.mjs <env>
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const env = process.argv[2]
  if (!env) {
    console.error('Usage: gen-version.mjs <env>')
    process.exit(1)
  }
  const version = genVersion(env)
  console.error(`version -> ${version.pretty} [${env}] versionCode: ${version.versionCode}`)
  process.stdout.write(JSON.stringify(version) + '\n')
}
