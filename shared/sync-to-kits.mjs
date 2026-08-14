#!/usr/bin/env node
// Fans shared/sync-conventions.template.mjs out into each kit's own
// scripts/sync-conventions.mjs, substituting that kit's real package name.
// Each generated file is fully self-contained — no runtime dependency on
// `shared/` — because a consumer installing a single kit via
// `github:lxtzfr/my-stack#path:<kit>` only ever fetches that kit's own
// subdirectory (see shared/README.md for why).
//
// Run after editing the template: `node shared/sync-to-kits.mjs`

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const template = readFileSync(join(repoRoot, 'shared', 'sync-conventions.template.mjs'), 'utf-8')

const kits = [
  { dir: 'tanstack', pkgName: '@lxtzfr/my-stack-tanstack' },
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
