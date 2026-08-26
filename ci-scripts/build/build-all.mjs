#!/usr/bin/env node
// Bumps + builds/pushes every docker service in ci-scripts.config.mjs's `services` map, builds any
// `subImages` (no bump/branch cycle of their own), builds the `apk` target if configured, then
// bumps any `bump` project with a fixedBranch (no env — e.g. a shared asset repo). Runs
// sequentially so downstream services see a ready upstream. Always attempts the build after a bump
// step, even if bump-version.mjs found nothing new to bump (exit code 2) — a previous run may have
// bumped a commit but failed before building it, and build-service.mjs's own sha-tag check makes a
// build against an already-built commit cheap (seconds, not minutes). Continues past a real
// failure so one broken project doesn't block the others — the summary at the end shows what
// actually happened.
// Usage: node build/build-all.mjs [env] [--force]
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createInterface } from 'node:readline/promises'
import { readRecap } from '../shared/utils.mjs'
import { loadConfig } from '../shared/config.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const IS_WIN = process.platform === 'win32'

const config = await loadConfig()
const { workspaceRoot, configDir, envs, services = {}, subImages = {}, apk, bump = {} } = config
const deployEnvs = Object.keys(envs).filter(e => e !== 'loc')

const force = process.argv.includes('--force')
async function resolveEnv(argv) {
  const arg = argv.slice(2).find(a => a !== '--force')
  if (arg) {
    if (!deployEnvs.includes(arg)) { console.error(`Invalid env '${arg}' — must be one of: ${deployEnvs.join(', ')}`); process.exit(1) }
    return arg
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const answer = (await rl.question(`Which env? (${deployEnvs.join('/')}): `)).trim()
  rl.close()
  if (!deployEnvs.includes(answer)) { console.error(`Invalid env '${answer}'`); process.exit(1) }
  return answer
}

const env = await resolveEnv(process.argv)

function runStep(label, args, cwd = workspaceRoot) {
  console.log(`\n${'='.repeat(70)}\n${label}\n${'='.repeat(70)}\n`)
  const [bin, ...rest] = args
  const r = spawnSync(bin, rest, { cwd, stdio: 'inherit', shell: IS_WIN })
  return r.status
}

const results = []

// Docker-built services. Those with a matching `bump` entry go through the bump -> checkout
// deploy/<env> -> build cycle; services with no bump entry build straight off whatever's checked
// out (typically main) — see build-service.mjs. Skips stub entries (no `build` function) — some
// configs declare a `services.<name>` with only a `dir` so another lookup (assertUpstreamReady,
// bump-version's dir resolution) can find a sibling/self repo without that entry being a real
// buildable target.
for (const [service, svc] of Object.entries(services)) {
  if (typeof svc.build !== 'function') continue
  if (bump[service]) {
    const bumpStatus = runStep(`Bump ${service} [${env}]`, ['node', join(__dirname, 'bump-version.mjs'), service, env])
    if (bumpStatus !== 0 && bumpStatus !== 2) { results.push({ project: service, status: 'FAILED (bump)' }); continue }

    // bump-version.mjs always returns to main when it's done — build-service.mjs requires deploy/<env>.
    const checkoutStatus = runStep(`Checkout deploy/${env} [${service}]`, ['git', 'checkout', `deploy/${env}`], join(workspaceRoot, svc.dir ?? service))
    if (checkoutStatus !== 0) { results.push({ project: service, status: `FAILED (no deploy/${env} branch — bump it first)` }); continue }
  }

  const buildStatus = runStep(`Build ${service} [${env}]`, ['node', join(__dirname, 'build-service.mjs'), service, env, ...(force ? ['--force'] : [])])
  if (buildStatus !== 0 && buildStatus !== 2) { results.push({ project: service, status: 'FAILED (build)' }); continue }
  const recap = readRecap(configDir, `${service}-${env}`)
  results.push({ project: service, status: buildStatus === 0 ? 'built' : 'up to date', recap })
}

// Sub-images have no repo/branch/bump cycle of their own — build them straight off main.
for (const name of Object.keys(subImages)) {
  const buildStatus = runStep(`Build ${name} [${env}]`, ['node', join(__dirname, 'build-sub-image.mjs'), name, env, ...(force ? ['--force'] : [])])
  const recap = readRecap(configDir, `${name}-${env}`)
  results.push({ project: name, status: buildStatus === 0 ? 'built' : buildStatus === 2 ? 'up to date' : 'FAILED (build)', recap })
}

// APK build (optional), same bump -> checkout -> build cycle as a docker service.
if (apk && Object.keys(apk.envs).includes(env)) {
  const bumpProject = apk.bumpProject ?? 'unity'
  const bumpStatus = runStep(`Bump ${bumpProject} [${env}]`, ['node', join(__dirname, 'bump-version.mjs'), bumpProject, env])
  if (bumpStatus !== 0 && bumpStatus !== 2) {
    results.push({ project: bumpProject, status: 'FAILED (bump)' })
  } else {
    const checkoutStatus = runStep(`Checkout deploy/${env} [${bumpProject}]`, ['git', 'checkout', `deploy/${env}`], join(workspaceRoot, apk.unityProjectDir))
    if (checkoutStatus !== 0) {
      results.push({ project: bumpProject, status: `FAILED (no deploy/${env} branch — bump it first)` })
    } else {
      const buildStatus = runStep(`Build ${bumpProject} [${env}]`, ['node', join(__dirname, 'build-apk.mjs'), env, ...(force ? ['--force'] : [])])
      const recap = readRecap(configDir, `${bumpProject}-${env}`)
      results.push({ project: bumpProject, status: buildStatus === 0 ? 'built' : buildStatus === 2 ? 'up to date' : 'FAILED (build)', recap })
    }
  }
}

// fixedBranch bump projects (e.g. a shared asset repo with no per-env deploys) run last, once per
// build-all invocation regardless of env.
for (const [project, def] of Object.entries(bump)) {
  if (!def.fixedBranch) continue
  const status = runStep(`Bump ${project}`, ['node', join(__dirname, 'bump-version.mjs'), project])
  results.push({ project, status: status === 2 ? 'skipped — nothing to bump' : status === 0 ? 'bumped' : 'FAILED (bump)' })
}

console.log(`\n${'='.repeat(70)}\nSummary [${env}]\n${'='.repeat(70)}`)
for (const { project, status, recap } of results) {
  const detail = recap ? ` — ${recap.version} (${recap.identity})` : ''
  console.log(`  ${project.padEnd(12)} ${status}${detail}`)
}

process.exit(results.some(r => r.status.startsWith('FAILED')) ? 1 : 0)
