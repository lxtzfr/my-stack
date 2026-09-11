# dev-env

[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE.md)

Local dev setup that ends the "two projects want the same port" problem for good: one shared
[Traefik](https://traefik.io) reverse proxy routes `*.localhost` hostnames to per-project Docker
containers. Every project keeps its own memorable URL (`myapp.localhost`) no matter what internal
port it actually runs on, and containers can all use the same internal port (e.g. `3000`) without
ever colliding, since only Traefik touches the host's ports.

Bonus over running Node directly on the host: every project gets the exact same environment
(Node version, OS) on every machine — no local Node install, no "works on my machine".

## How it works

- **One Traefik instance**, started once per machine, listens on port 80 and watches the Docker
  socket. It never needs touching again when you add a new project — no central config file to
  edit.
- **Each project** runs in dev mode via `docker compose -f docker-compose.dev.yml up`, with the
  source bind-mounted into the container (not `COPY`ed), so the framework's own watch mode
  (`nest start --dev`, `next dev`, ...) reacts to file changes exactly like running on the host.
  A rebuild is only needed when `package.json`/the lockfile changes.
- **Traefik labels** on each project's compose service tell Traefik which hostname routes to
  which container — no port mapped to the host at all.

## Setup (once per machine)

```bash
docker compose -f node_modules/@lxtzfr/my-stack-dev-env/traefik/docker-compose.yml up -d
```

This starts Traefik on port 80 and creates the external `dev-env` Docker network that every
project's compose file joins. Leave it running (or add it to your machine's startup routine) —
you don't restart it per project.

## Usage in a project

```bash
pnpm add -D github:lxtzfr/my-stack#path:dev-env
pnpm exec dev-env init --name myapp --port 3000
```

This scaffolds, in the current directory:

- **`Dockerfile.dev`** — installs deps from the lockfile, then `CMD`s the dev/watch script.
  Edit the final `CMD` if the project's watch command isn't `npm run start:dev`.
- **`docker-compose.dev.yml`** — bind-mounts the project into the container and adds the Traefik
  labels for `myapp.localhost`.

Neither file is overwritten if it already exists — `init` prints the block to merge by hand
instead.

Then, day to day:

```bash
docker compose -f docker-compose.dev.yml up
```

and open `http://myapp.localhost`. No port to remember, no `.env` juggling between projects — if
two projects both listen on `3000` inside their own containers, that's fine, since neither port is
ever exposed to the host.

## `dev-env init` options

| Flag | Default | Purpose |
|---|---|---|
| `--name` | `<org>-<repo>` from the git remote, else `package.json`'s `name` (scope stripped), else the directory name | The `*.localhost` hostname and Traefik router/service id. Lowercased, non-alphanumeric chars become `-`. |
| `--port` | `3000` | The port the app listens on **inside** the container. Never exposed to the host — only Traefik reaches it, over the `dev-env` network. |

## Naming convention

Default is `<org>-<repo>` from the git remote (e.g. `veezbot-server`, `veezbot-web` for repos
under a shared `veezbot` org holding per-service repos). When a product already has its own
dedicated org (e.g. `lxtzfr-website/web`), that default is redundant — pass `--name` explicitly
for the shorter form you actually want (`--name lxtzfr-website`). There's no reliable way to
detect "org already says it" automatically, so this stays a manual call.

## Adjusting the template

- Different package manager: `Dockerfile.dev` already detects `pnpm-lock.yaml`/`yarn.lock`/
  `package-lock.json` and picks the matching install command.
- Different Node version: edit the `FROM node:22` line after scaffolding.
- Multiple services in one project (e.g. API + worker): duplicate the `app` block in
  `docker-compose.dev.yml`, give each its own Traefik router name and, if it doesn't serve HTTP,
  drop the `traefik.*` labels and just join the `dev-env` network so sibling containers can reach
  it by service name.

## Windows / Docker Desktop notes

- **Traefik version matters.** Docker Desktop's engine API can be newer than an older Traefik
  build's vendored Docker client tolerates — this shows up as a Docker provider stuck retrying
  `API returned a 400 (Bad Request) but provided no error-message`. If you hit that, bump the
  `image:` tag in `traefik/docker-compose.yml` to a newer Traefik release.
- **File-change detection can need polling.** Docker Desktop bind mounts don't always propagate
  native filesystem events (inotify) into the container from a Windows-side path. Most watchers
  (webpack, ts-node, NestJS's `--watch`) pick this up fine once you set `CHOKIDAR_USEPOLLING=true`
  in the compose service's `environment:` — already the case if you scaffolded with `dev-env init`.
- **Some Vite setups don't, even with polling.** Vite's per-environment module-graph watcher has
  an open upstream bug where `usePolling` (set via `CHOKIDAR_USEPOLLING`, `server.watch`, or a
  framework's own watch option) silently has no effect for some plugin stacks — seen with
  TanStack Start + Nitro (see
  [vitejs/vite#18689](https://github.com/vitejs/vite/issues/18689), unresolved as of writing).
  Symptom: editing a source file changes nothing, no reload, no error — while editing
  `vite.config.ts` itself *does* trigger a restart (that watcher is separate and unaffected).
  If you hit this, don't chase it — wrap the dev command with a
  [nodemon](https://github.com/remy/nodemon) that polls the filesystem itself and fully restarts
  the process instead of relying on Vite's watcher:
  ```json
  // package.json — add nodemon as a devDependency, then:
  "dev:docker": "nodemon --legacy-watch --polling-interval 300 --watch src --ext ts,tsx,css -x \"pnpm run dev\""
  ```
  ```yaml
  # docker-compose.dev.yml
  command: pnpm run dev:docker
  ```
  No HMR (a save is a full process restart, state is lost), but reliable — and it doesn't touch
  the app's own dev server config.

## Cross-device access (phone, Raspberry Pi, Tailscale, ...)

`*.localhost` only resolves on the machine running Traefik — it's a loopback convention, not real
DNS, so another device on your network (or on Tailscale) can't reach `myapp.localhost`. If a
project has an external consumer like that (e.g. hardware talking to it over Tailscale
MagicDNS), don't route it through `dev-env` — keep it running natively on a fixed host port, as
that consumer already expects. `dev-env` is a same-machine convenience layer, not a replacement
for that.

If you just want occasional cross-device access (e.g. testing responsive layout from a phone),
either keep exposing the container's port to the host directly (`ports: - "3000:3000"` alongside
the `dev-env` network) and hit `http://<tailscale-hostname>:3000`, or add a second `Host(...)`
rule to the Traefik label matching that hostname too.

## What this doesn't do

No HTTPS (plain `*.localhost` HTTP is enough for local dev; add a `websecure` entrypoint +
`tls.domain` labels yourself if a project specifically needs to test HTTPS behavior). No
production routing — this is dev-only tooling; see [`ci-scripts/`](../ci-scripts) for the
build/push/deploy side.

## License

[MIT](LICENSE.md)
