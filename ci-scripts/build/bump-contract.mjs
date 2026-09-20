#!/usr/bin/env node
// Bumps a project's semver *contract* version — independent of bump-version.mjs's per-env
// timestamp, which only marks "when was this deployed" and carries no compatibility meaning. This
// one is bumped by hand, only when a human decides an integration surface changed in a
// breaking/additive/fix way, and always straight onto `main` (never per-env) since a contract is a
// promise about the shape of an integration, not something that varies by deploy target.
// Usage: node build/bump-contract.mjs [project] [major|minor|patch]
import { resolve } from 'node:path'
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { createInterface } from 'node:readline/promises'
import { makeLogger } from '../shared/log.mjs'
import { loadConfig } from '../shared/config.mjs'

const BUMP_KINDS = ['major', 'minor', 'patch']

const config = await loadConfig()
const { workspaceRoot, contracts: projects, services = {} } = config
if (!projects) { console.error('No `contracts` map in ci-scripts.config.mjs'); process.exit(1) }

// Set once project/kind are resolved below, same reasoning as bump-version.mjs.
let log = null

function fail(message) {
  log ? log.error(message) : console.error(message)
  process.exit(1)
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

const project = await resolveArg(process.argv, 2, Object.keys(projects), 'Which project do you want to bump the contract for?')
const kind = await resolveArg(process.argv, 3, BUMP_KINDS, 'Bump kind?')

log = makeLogger(project)
log.step(`Starting contract bump (${kind})`)

// Same dir-resolution convention as bump-version.mjs: `project` defaults to the checkout dir, but
// a single-repo project (`services[project].dir: '.'`) needs that override respected here too.
const repoDir = resolve(workspaceRoot, services[project]?.dir ?? project)
const versionFilePath = resolve(repoDir, projects[project].versionFile)

function git(args) {
  return execFileSync('git', args, { cwd: repoDir, encoding: 'utf8' }).trim()
}

// --- Pre-flight checks — always strict on `main`, no per-env/looseEnvs escape hatch. A contract
// version is a promise about the shape of an integration; it never makes sense to cut it from an
// unreviewed WIP branch the way a per-env deploy timestamp can. ---
if (git(['status', '--porcelain'])) {
  fail('Working tree is not clean. Commit or stash changes before bumping the contract version.')
}

const currentBranch = git(['rev-parse', '--abbrev-ref', 'HEAD'])
if (currentBranch !== 'main') {
  fail(`Must be on 'main' to bump a contract version (currently on '${currentBranch}').`)
}

git(['fetch', 'origin', 'main'])
if (git(['rev-parse', 'main']) !== git(['rev-parse', 'origin/main'])) {
  fail(`Local 'main' is out of sync with 'origin/main'. Push/pull before bumping.`)
}

// --- Read + bump the semver ---
if (!existsSync(versionFilePath)) {
  fail(`${versionFilePath} does not exist — create it with {"version": "0.1.0"} first.`)
}

const data = JSON.parse(readFileSync(versionFilePath, 'utf8'))
const currentVersion = data.version
const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(currentVersion ?? '')
if (!match) fail(`${versionFilePath}'s "version" (${JSON.stringify(currentVersion)}) is not a plain semver (X.Y.Z).`)

let [major, minor, patch] = [Number(match[1]), Number(match[2]), Number(match[3])]
if (kind === 'major') { major += 1; minor = 0; patch = 0 }
else if (kind === 'minor') { minor += 1; patch = 0 }
else { patch += 1 }
const newVersion = `${major}.${minor}.${patch}`

data.version = newVersion
writeFileSync(versionFilePath, JSON.stringify(data, null, 2) + '\n')

git(['add', versionFilePath])
git(['commit', '-m', `Bump ${project} contract to ${newVersion} (${kind})`])
git(['push', 'origin', 'main'])

log.done(`bumped contract ${currentVersion} -> ${newVersion}, pushed 'main'`)
