#!/usr/bin/env node
// Fans core/sync-conventions.template.mjs out into a kit's own
// scripts/sync-conventions.mjs, substituting that kit's real package name.
// This is legacy, npm-lifecycle-free tooling — kits with a package.json
// (tanstack, nestjs, react-native) now depend on @lxtzfr/my-stack-core
// as a real dependency instead (see core/README.md), so this generator
// only still applies to unity, which has no package.json/npm install step
// to hang a real dependency off of. Revisit once unity's own mechanism is
// decided.
//
// Run after editing the template: `node core/sync-to-kits.mjs`

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const template = readFileSync(join(repoRoot, 'core', 'sync-conventions.template.mjs'), 'utf-8')

const kits = [
  { dir: 'unity', pkgName: '@lxtzfr/my-stack-unity' },
]

for (const { dir, pkgName } of kits) {
  const kitPath = join(repoRoot, dir)
  if (!existsSync(kitPath)) continue

  const generated = template.replaceAll('__KIT_PKG_NAME__', pkgName)
  const scriptsDir = join(kitPath, 'scripts')
  mkdirSync(scriptsDir, { recursive: true })
  writeFileSync(join(scriptsDir, 'sync-conventions.mjs'), generated, 'utf-8')
  console.log(`[sync-to-kits] generated ${dir}/scripts/sync-conventions.mjs`)
}
