#!/usr/bin/env node
// Injects/updates fr.lxtz.my-stack-unity's managed blocks into the *consuming*
// Unity project: a CLAUDE.md conventions pointer, the canonical Unity
// .gitattributes ruleset (LFS filters for 3D/audio/video/image binaries, the
// unityyamlmerge driver, csharp diffing, ...), and a common Unity .gitignore
// baseline (the well-known github/gitignore Unity.gitignore body). These are
// real shared rules across every TRA-SIM Unity project (unity, unity-asset),
// not per-project guesswork — see ../templates/gitattributes and
// ../templates/gitignore for the source of truth.
//
// Unlike the npm-based kits (tanstack, nestjs), Unity has no
// postinstall/lifecycle hook — a consumer runs this by hand after adding the
// package to Packages/manifest.json:
//   node Packages/fr.lxtz.my-stack-unity/scripts/sync-conventions.mjs
// (path depends on whether the package was added as a git dependency —
// resolves under Library/PackageCache/fr.lxtz.my-stack-unity@<hash> — or
// embedded directly under Packages/).
//
// Each block is delimited by its own START/END markers so re-running only
// touches its own block, leaving the rest of the file alone (idempotent).

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, dirname, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'

const KIT_PKG_NAME = 'fr.lxtz.my-stack-unity'
const kitRoot = join(dirname(fileURLToPath(import.meta.url)), '..')

// Run from the consuming project's root, e.g.
// `node Packages/fr.lxtz.my-stack-unity/scripts/sync-conventions.mjs` from
// the Unity project root — cwd at invocation time is the target.
const targetRoot = process.cwd()

function syncManagedBlock(path, start, end, wrapped) {
  const existing = existsSync(path) ? readFileSync(path, 'utf-8') : ''

  let next
  if (existing.includes(start) && existing.includes(end)) {
    const before = existing.slice(0, existing.indexOf(start))
    const after = existing.slice(existing.indexOf(end) + end.length)
    next = `${before}${wrapped}${after}`
  } else if (existing.trim().length > 0) {
    next = `${existing.trimEnd()}\n\n${wrapped}\n`
  } else {
    next = `${wrapped}\n`
  }

  if (next === existing) return false
  writeFileSync(path, next, 'utf-8')
  return true
}

function syncClaudeMd() {
  const START = `<!-- ${KIT_PKG_NAME}:conventions:start -->`
  const END = `<!-- ${KIT_PKG_NAME}:conventions:end -->`
  const wrapped = `${START}\n<!-- Managed by ${KIT_PKG_NAME}. -->\n\nFor conventions shared across TRA-SIM Unity projects, read the \`conventions/CLAUDE.md\`\nfile inside this package (under \`Library/PackageCache/${KIT_PKG_NAME}@<hash>/\` if\ninstalled as a git dependency, or \`Packages/my-stack-unity/\` if embedded).\n${END}`

  const path = join(targetRoot, 'CLAUDE.md')
  const wasExisting = existsSync(path)
  if (syncManagedBlock(path, START, END, wrapped)) {
    console.log(`[${KIT_PKG_NAME}] ${wasExisting ? 'updated' : 'created'} conventions pointer in ${path}`)
  }
}

// The canonical Unity .gitattributes: LFS filters for 3D/audio/video/image
// binaries, the unityyamlmerge driver for scenes/prefabs/etc., csharp
// diffing. Identical across unity and unity-asset today — this is the real
// shared rule the other kits' generic `* text=auto eol=lf` line-ending-only
// block doesn't capture.
function syncGitAttributes() {
  const START = `# ${KIT_PKG_NAME}:gitattributes:start`
  const END = `# ${KIT_PKG_NAME}:gitattributes:end`
  const template = readFileSync(join(kitRoot, 'templates', 'gitattributes'), 'utf-8').trimEnd()
  const wrapped = `${START}\n# Managed by ${KIT_PKG_NAME} — re-run this package's sync-conventions.mjs to refresh.\n# Edit templates/gitattributes in the kit itself, not this block, to change it for every consumer.\n${template}\n${END}`

  const path = join(targetRoot, '.gitattributes')
  const wasExisting = existsSync(path)
  if (syncManagedBlock(path, START, END, wrapped)) {
    console.log(`[${KIT_PKG_NAME}] ${wasExisting ? 'updated' : 'created'} Unity .gitattributes ruleset in ${path}`)
  }

  try {
    execSync('git lfs install', { cwd: targetRoot, stdio: 'ignore' })
  } catch {
    console.warn(`[${KIT_PKG_NAME}] git-lfs not found — install it (https://git-lfs.com) then run \`git lfs install\` in ${targetRoot}`)
  }
}

// The common github/gitignore Unity.gitignore body — Library/Temp/Logs/
// UserSettings, IDE cruft, Addressables/VisualScripting generated files,
// etc. Project-specific additions (e.g. a local asset folder to exclude)
// stay outside this managed block, appended below it by hand.
function syncGitIgnore() {
  const START = `# ${KIT_PKG_NAME}:gitignore:start`
  const END = `# ${KIT_PKG_NAME}:gitignore:end`
  const template = readFileSync(join(kitRoot, 'templates', 'gitignore'), 'utf-8').trimEnd()
  const wrapped = `${START}\n# Managed by ${KIT_PKG_NAME} — re-run this package's sync-conventions.mjs to refresh.\n# Add project-specific ignores below this block, not inside it.\n${template}\n${END}`

  const path = join(targetRoot, '.gitignore')
  const wasExisting = existsSync(path)
  if (syncManagedBlock(path, START, END, wrapped)) {
    console.log(`[${KIT_PKG_NAME}] ${wasExisting ? 'updated' : 'created'} common Unity .gitignore baseline in ${path}`)
  }
}

function main() {
  if (process.env.CI) return // don't rewrite files unexpectedly in CI
  if (`${targetRoot}${sep}`.includes(`${sep}Library${sep}PackageCache${sep}`)) return // safety net

  syncClaudeMd()
  syncGitAttributes()
  syncGitIgnore()
}

main()
