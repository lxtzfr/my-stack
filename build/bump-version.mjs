#!/usr/bin/env node
// Bumps a project's version, merging main into its deploy branch (creating it the first time)
// and adding a version bump commit on top, then pushes. Never force-pushes.
// Projects and their deploy-branch behavior come from ci-scripts.config.mjs's `bump` map — a
// project with `fixedBranch` always bumps to that single branch (no env); otherwise it bumps to
// deploy/<env> for one of config's `envs` (minus 'loc').
// Usage: node build/bump-version.mjs [project] [env]   (env prompted/ignored for fixedBranch projects)
import { resolve } from 'node:path'
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { createInterface } from 'node:readline/promises'
import { makeLogger } from '../shared/log.mjs'
import { loadConfig } from '../shared/config.mjs'

const config = await loadConfig()
const { workspaceRoot, bump: projects, envs } = config
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

const repoDir = resolve(workspaceRoot, project)
const versionFilePath = resolve(workspaceRoot, projects[project].versionFile)
const deployBranch = fixedBranch ?? `deploy/${env}`

function git(args) {
  return execFileSync('git', args, { cwd: repoDir, encoding: 'utf8' }).trim()
}

// --- Pre-flight checks on main ---
if (git(['status', '--porcelain'])) {
  fail('Working tree is not clean. Commit or stash changes before bumping the version.')
}

const branch = git(['rev-parse', '--abbrev-ref', 'HEAD'])
if (branch !== 'main') {
  fail(`Must be on 'main' to bump the version (currently on '${branch}').`)
}

git(['fetch', 'origin', 'main'])
if (git(['rev-parse', 'main']) !== git(['rev-parse', 'origin/main'])) {
  fail("Local 'main' is out of sync with 'origin/main'. Push/pull before bumping.")
}

// --- Already-bumped guard ---
let deployBranchExistsRemotely = true
try {
  git(['fetch', 'origin', deployBranch])
} catch {
  deployBranchExistsRemotely = false
}

if (deployBranchExistsRemotely) {
  let mainAlreadyPublished = false
  try {
    git(['merge-base', '--is-ancestor', 'main', `origin/${deployBranch}`])
    mainAlreadyPublished = true
  } catch {
    mainAlreadyPublished = false
  }
  if (mainAlreadyPublished) {
    skip(`Nothing changed on main since the last bump of '${env ? `${project}/${env}` : project}' — skipping.`)
  }
}

// --- Compute the new version from the current date/time ---
const d = new Date()
const datePart = `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}` // semver-safe, no leading zeros
const timePart = `${d.getHours()}.${d.getMinutes()}` // pre-release, no leading zeros
const newVersion = `${datePart}-${timePart}`

// --- Bring deploy/<env> up to date with main (merge, never force-push) ---
if (deployBranchExistsRemotely) {
  git(['checkout', '-B', deployBranch, `origin/${deployBranch}`])
  try {
    git(['merge', '--no-ff', 'main', '-m', `Merge main into ${deployBranch}`])
  } catch (err) {
    git(['merge', '--abort'])
    git(['checkout', 'main'])
    fail(`Conflict merging main into ${deployBranch} — resolve manually.\n${err.message}`)
  }
} else {
  git(['checkout', '-b', deployBranch, 'main'])
}

const pkg = JSON.parse(readFileSync(versionFilePath, 'utf8'))
if (newVersion === pkg.version) {
  git(['checkout', 'main'])
  fail(`Version unchanged (${newVersion}) — try again in the next minute.`)
}

pkg.version = newVersion
writeFileSync(versionFilePath, JSON.stringify(pkg, null, 2) + '\n')

git(['add', versionFilePath])
git(['commit', '-m', env ? `Bump ${project} to ${newVersion} [${env}]` : `Bump ${project} to ${newVersion}`])
git(deployBranchExistsRemotely ? ['push', 'origin', deployBranch] : ['push', '-u', 'origin', deployBranch])

git(['checkout', 'main'])

log.done(`bumped to ${newVersion}, pushed '${deployBranch}'`)
