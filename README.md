# ci-scripts

[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE.md)

Config-driven bump / build / push / deploy toolkit for git-based projects, shipping to
**[Dokploy](https://dokploy.com)**. Pure Node, zero dependencies — it shells out to the CLIs you
already use (`git`, `docker`, `gh`/`glab`).

Docker images push to either **GitLab** (`registry.gitlab.com`, via `glab`) or **GitHub**
(`ghcr.io`, via `gh`) — auto-detected per project from its own git remote, so a GitLab repo and a
GitHub repo can coexist in the same workspace.

## How it works

Every command reads `ci-scripts/config.mjs` (auto-discovered by walking up from wherever you run
it) and does exactly what that config says:

- **Plain values** (env hosts, Dokploy webhooks, project name) are just config keys.
- **Behavior** (how to build a service, what env vars a compose needs) is a **function you write**
  in the config, e.g. `services.server.build: ({ run, env, log }) => { run([...]) }`.

So `ci-scripts build server prod` = load config → call `config.services.server.build()` → handle
the generic parts (skip-if-unchanged, push, Dokploy sync, deploy verification) that are the same
for every service.

## Install

```bash
pnpm add -D github:lxtzfr/ci-scripts
# or, pinned to a tagged version:
pnpm add -D github:lxtzfr/ci-scripts#v2026.7.31-14.32
```

## Quick start

1. Copy [`ci-scripts.config.example.mjs`](ci-scripts.config.example.mjs) to
   `ci-scripts/config.mjs` at your workspace root (next to your top-level `package.json`), and fill
   in `envs`, `bump`, `services` (and optionally `subImages`, `apk`, `dokploySetup`).
2. Set credentials as env vars, or in `ci-scripts/.env` (auto-loaded by the Dokploy commands):

   | Var | Needed for |
   |---|---|
   | `GITLAB_PAT` | GitLab-remote services (registry read/write). `glab auth login` covers registry listing/cleanup and generic packages. |
   | `GITHUB_TOKEN` | GitHub-remote services (`write:packages`/`read:packages`/`delete:packages`, + `repo` if private). Falls back to `gh auth token`. |
   | `DOKPLOY_TOKEN` + `DOKPLOY_URL` | Dokploy API access. On a multi-org instance the token is bound to whichever org was active when it was created. |
   | `CF_DNS_API_TOKEN` | Only for `dokploy-setup-env`'s wildcard-domain step. |

3. Run it:

   ```bash
   pnpm exec ci-scripts bump myservice prod
   pnpm exec ci-scripts build myservice prod
   ```

## Commands

| Command | Does |
|---|---|
| `bump <project> <env>` | Bumps a project's version, merges `main` into `deploy/<env>` (creating it if needed), commits, pushes. No-op (exit `2`) if `main` hasn't changed since the last bump. |
| `build <service> <env>` | Runs the service's `build()`, pushes to the auto-detected registry, syncs the Dokploy compose, triggers a deploy, polls until it's live. Skips the rebuild if this commit was already shipped for this env. |
| `build-sub-image <name> <env>` | Builds a content-hash-keyed image (e.g. large static assets) nested under a parent service's registry namespace, reusing its Dokploy webhook. |
| `build-apk <env>` | Builds a Unity Android project and pushes the APK as a GitLab generic package (GitLab-only). |
| `build-all <env>` | Runs `bump` → `build` for every configured service/sub-image/APK, keeps going past individual failures, prints a summary table. |
| `verify-deploy <service> <env> <versionTag>` | Polls the service's health URL until it reports the expected version. |
| `gen-version <env>` | Generates a timestamp version + Android `versionCode`. |
| `dokploy-setup-env <env>` | Provisions a new Dokploy environment (composes, domains, wildcard DNS) — idempotent. |
| `dokploy-compose-sync <service> <env>` | Pushes the local `docker-compose.yml` to Dokploy if it drifted. |
| `dokploy-seed <env>` | SSHes into the VPS and runs the configured re-seed command. |

Add `--force` to `build`/`build-apk`/`build-sub-image`/`build-all` to bypass the "already built"
skip check.

## What it assumes

- Each buildable thing lives in its own git repo — either a sibling directory under one workspace
  root (multi-repo), or the workspace root itself via `services[x].dir: '.'` (single-repo).
- Releases go through a `deploy/<env>` branch cut from `main` (add a `bump` entry) — or, with no
  `bump` entry, build straight off whatever's checked out, for projects that skip the
  branch-per-env ceremony.
- Deploy target is Dokploy, not swappable without extending `docker-service-build.mjs`/`dokploy/*`.
  `build-apk.mjs` is still specifically tied to Unity.

## Config reference

See the fully-commented [`ci-scripts.config.example.mjs`](ci-scripts.config.example.mjs).

| Block | Used by | Purpose |
|---|---|---|
| `dokploy` | `dokploy-*`, `build`, `build-sub-image` | Dokploy URL/project/SSH access |
| `envs` | everything | env catalog (`host`/`apiHost` per env); `loc` is never deployable |
| `bump` | `bump`, `build`, `build-apk`, `build-all` | which projects have a `deploy/<env>` cycle |
| `services` | `build`, `build-all`, `verify-deploy` | docker-built services: webhooks, health check, build steps |
| `subImages` | `build-sub-image`, `build-all` | content-hash-keyed images nested under a parent service |
| `apk` | `build-apk`, `build-all` | Unity Android build config (GitLab only) |
| `dokploySetup` | `dokploy-setup-env` | how to provision composes/domains/wildcard for a new env |

Registry (GitLab vs. GitHub) is auto-detected per service from its own `git remote get-url origin`
— not a config field.

## Running in CI

Every command that would otherwise prompt (`bump`, `build-all`) must be called with its arguments
explicit — there's no stdin in CI. Use a full (non-shallow) checkout so `main`/`deploy/<env>`
comparisons work. See [`.github/workflows/checks.yml`](.github/workflows/checks.yml) for an example.

## License

[MIT](LICENSE.md)
