#!/usr/bin/env node
// Bumps a project's version, merging its source branch into its deploy branch (creating it the
// first time) and adding a version bump commit on top, then pushes. Never force-pushes.
// Projects and their deploy-branch behavior come from ci-scripts.config.mjs's `bump` map — a
// project with `fixedBranch` always bumps to that single branch (no env); otherwise it bumps to
// deploy/<env> for one of config's `envs` (minus 'loc'). The source branch is 'main' by default
// (requires being on it, in sync with origin/main — a deploy branch only ever cuts from reviewed,
// shared code) unless `bump[project].looseEnvs` lists this env, in which case it bumps from
// whatever branch is currently checked out instead — useful for testing a WIP branch's own deploy
// (e.g. dev) without merging to main first. Still requires that branch to be clean and in sync
// with its own origin tracking branch.
// Usage: node build/bump-version.mjs [project] [env]   (env prompted/ignored for fixedBranch projects)
import { resolve } from 'node:path'
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { createInterface } from 'node:readline/promises'
import { makeLogger } from '../shared/log.mjs'
import { loadConfig } from '../shared/config.mjs'
import { readContractVersion } from '../shared/utils.mjs'

const config = await loadConfig()
const { workspaceRoot, bump: projects, envs, services = {} } = config
if (!projects) { console.error('No `bump` map in ci-scripts.config.mjs'); process.exit(1) }
const deployEnvs = Object.keys(envs).filter(e => e !== 'loc')

// Set once project/env are resolved below. Before that, arg-validation errors aren't tied to a
// specific project/env yet, so fail()/skip() fall back to plain untagged output.
let log = null

function fail(message) {
  log ? log.error(message) : console.error(message)
  process.exit(1)
}

// Distinct from fail(): "nothing to do" is not an error. build-all.mjs relies on this exit code
// to skip a project silently instead of reporting it as failed.
function skip(message) {
  log ? log.skip(message) : console.log(message)
  process.exit(2)
}

async function prompt(question, choices) {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const answer = await rl.question(`${question} (${choices.join('/')}): `)
  rl.close()
  return answer.trim()
}

async function resolveArg(argv, index, choices, question) {
  const arg = argv[index]
  if (arg) {
    if (!choices.includes(arg)) fail(`Invalid value '${arg}' — must be one of: ${choices.join(', ')}`)
    return arg
  }
  const answer = await prompt(question, choices)
  if (!choices.includes(answer)) fail(`Invalid value '${answer}' — must be one of: ${choices.join(', ')}`)
  return answer
}

const project = await resolveArg(process.argv, 2, Object.keys(projects), 'Which project do you want to bump?')
const fixedBranch = projects[project].fixedBranch
const env = fixedBranch ? null : await resolveArg(process.argv, 3, deployEnvs, 'Which env?')

log = makeLogger(project, env)
log.step('Starting bump')

// `project` is the bump map key, which defaults to being the checkout dir too (the multi-repo
// convention) — but a single-repo project (`services[project].dir: '.'`) needs that override
// respected here as well, or this resolves to a nonexistent `<workspaceRoot>/<project>` subdir.
const repoDir = resolve(workspaceRoot, services[project]?.dir ?? project)
const versionFilePath = resolve(workspaceRoot, projects[project].versionFile)
const deployBranch = fixedBranch ?? `deploy/${env}`

function git(args) {
  return execFileSync('git', args, { cwd: repoDir, encoding: 'utf8' }).trim()
}

// --- Pre-flight checks on the source branch ---
if (git(['status', '--porcelain'])) {
  fail('Working tree is not clean. Commit or stash changes before bumping the version.')
}

// fixedBranch projects (no per-env deploy cycle) always require main. Otherwise, an env listed in
// `looseEnvs` bumps from whatever's currently checked out instead of requiring main.
const looseEnvs = projects[project].looseEnvs ?? []
const strict = fixedBranch != null || !looseEnvs.includes(env)
const currentBranch = git(['rev-parse', '--abbrev-ref', 'HEAD'])
const sourceBranch = strict ? 'main' : currentBranch

if (currentBranch !== sourceBranch) {
  fail(`Must be on '${sourceBranch}' to bump the version (currently on '${currentBranch}').`)
}

git(['fetch', 'origin', sourceBranch])
if (git(['rev-parse', sourceBranch]) !== git(['rev-parse', `origin/${sourceBranch}`])) {
  fail(`Local '${sourceBranch}' is out of sync with 'origin/${sourceBranch}'. Push/pull before bumping.`)
}

// --- Already-bumped guard ---
let deployBranchExistsRemotely = true
try {
  git(['fetch', 'origin', deployBranch])
} catch {
  deployBranchExistsRemotely = false
}

if (deployBranchExistsRemotely) {
  let sourceAlreadyPublished = false
  try {
    git(['merge-base', '--is-ancestor', sourceBranch, `origin/${deployBranch}`])
    sourceAlreadyPublished = true
  } catch {
    sourceAlreadyPublished = false
  }
  if (sourceAlreadyPublished) {
    skip(`Nothing changed on '${sourceBranch}' since the last bump of '${env ? `${project}/${env}` : project}' — skipping.`)
  }
}

// --- Compute the new version from the current date/time ---
const d = new Date()
const datePart = `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}` // semver-safe, no leading zeros
const timePart = `${d.getHours()}.${d.getMinutes()}` // pre-release, no leading zeros
const timestamp = `${datePart}-${timePart}`

// --- Bring deploy/<env> up to date with the source branch (merge, never force-push) ---
if (deployBranchExistsRemotely) {
  git(['checkout', '-B', deployBranch, `origin/${deployBranch}`])
  try {
    git(['merge', '--no-ff', sourceBranch, '-m', `Merge ${sourceBranch} into ${deployBranch}`])
  } catch (err) {
    git(['merge', '--abort'])
    git(['checkout', sourceBranch])
    fail(`Conflict merging ${sourceBranch} into ${deployBranch} — resolve manually.\n${err.message}`)
  }
} else {
  git(['checkout', '-b', deployBranch, sourceBranch])
}

// Read post-merge so it reflects whatever contract-version.json now says on this branch — same
// base+metadata shape as gen-version.mjs's `full`, so a project's contract version is the one
// number that anchors both its per-env deploy identity and its app-visible BUILD_VERSION.
const contractVersion = readContractVersion(config, project)
const newVersion = contractVersion ? `${contractVersion}+${timestamp}` : timestamp

const pkg = JSON.parse(readFileSync(versionFilePath, 'utf8'))
if (newVersion === pkg.version) {
  git(['checkout', sourceBranch])
  fail(`Version unchanged (${newVersion}) — try again in the next minute.`)
}

pkg.version = newVersion
writeFileSync(versionFilePath, JSON.stringify(pkg, null, 2) + '\n')

git(['add', versionFilePath])
git(['commit', '-m', env ? `Bump ${project} to ${newVersion} [${env}]` : `Bump ${project} to ${newVersion}`])
git(deployBranchExistsRemotely ? ['push', 'origin', deployBranch] : ['push', '-u', 'origin', deployBranch])

git(['checkout', sourceBranch])

log.done(`bumped to ${newVersion}, pushed '${deployBranch}'`)
