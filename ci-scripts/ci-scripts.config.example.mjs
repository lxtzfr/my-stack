// Example config — copy to <your-project>/ci-scripts/config.mjs (so it lives inside a `ci-scripts/`
// folder at your project root, next to package.json) and adjust. Found automatically: every
// ci-scripts command walks up from process.cwd() looking for `ci-scripts/config.mjs`, so it works
// whether ci-scripts is an npm dependency, a git submodule, or copied in. Everything ci-scripts
// itself owns (this file, `.env`, build recaps) groups under that same `ci-scripts/` folder rather
// than scattering loose files at the project root.
//
// This example mirrors a real setup: two docker-built services (server + web) sharing a domain,
// deployed to Dokploy; a content-addressed sub-image (e.g. a TTS server) nested under server's
// registry/webhook; and a Unity Android build pushed as a GitLab generic package. Every block
// below except `envs` is optional — only fill in what you actually use.
import { randomUUID } from 'node:crypto';
import { subdomainEnv } from 'ci-scripts/shared/config-helpers.mjs';

const DOMAIN = 'example.com';

export default {
  // --- Dokploy (optional — only needed for compose sync / setup-env / seed) ---
  // On a multi-org Dokploy instance, which org DOKPLOY_TOKEN operates against is fixed at the
  // token's creation time (generate it from the dashboard while that org is active) — there's no
  // per-request way to switch it, so there's nothing to configure here for that.
  dokploy: {
    url: 'https://dokploy.example.com',   // or leave unset and export DOKPLOY_URL instead
    projectName: 'MYAPP',                  // Dokploy project name
    sshHost: 'deploy@203.0.113.10',        // optional, only for `ci-scripts dokploy-seed`
    seedService: 'server',                 // which compose's container to exec into
    seedCommand: (appName, env) => `sudo docker exec ${appName}-server-1 sh -c 'APP_ENV=${env} node dist/prisma/seed.js'`,
  },

  // --- Env catalog. 'loc' is conventionally local-only — every other key is deployable. ---
  envs: {
    loc: { host: 'localhost:3000', apiHost: 'http://localhost:3001' },
    dev: subdomainEnv(DOMAIN, 'dev'),
    stg: subdomainEnv(DOMAIN, 'stg'),
    prd: subdomainEnv(DOMAIN, null),
  },

  // --- `ci-scripts bump <project> <env>`: one entry per project with its own deploy/<env> branch cycle. ---
  bump: {
    server: { versionFile: 'server/package.json' },
    web:    { versionFile: 'web/package.json' },
    unity:  { versionFile: 'unity/package.json' },
    // fixedBranch: no per-env deploys — always bumps to this single branch.
    'unity-asset': { versionFile: 'unity-asset/Assets/Export/package.json', fixedBranch: 'deploy/release' },
    // looseEnvs: bump this project for 'dev' from whatever branch is currently checked out,
    // instead of requiring 'main' (still requires it be clean and pushed) — handy for testing a
    // WIP branch's own deploy before merging. Envs not listed here (stg/prd) still require main.
    // server: { versionFile: 'server/package.json', looseEnvs: ['dev'] },
  },

  // --- `ci-scripts build <service> <env>`: one entry per docker-built service. ---
  // Registry (GitLab vs GitHub) is auto-detected per service from its own `git remote` — no config
  // needed, a GitLab-hosted service and a GitHub-hosted one can coexist here. A service only goes
  // through the deploy/<env> branch cycle if it also has a `bump` entry above; otherwise `build`
  // builds straight off whatever's checked out (typically main) — see the single-repo example at
  // the bottom of this file. `dir` (defaults to the map key) lets the service's name differ from
  // its checkout path, e.g. `dir: '.'` when the workspace root IS the service's repo. Optional
  // `dockerfilePath`/`contextDir`/`composeFilePath` (relative to the workspace root) override where
  // those files actually live, e.g. grouped under ci-scripts/ instead of their `dir`-relative default.
  services: {
    server: {
      webhooks: { prd: 'https://dokploy.example.com/api/deploy/compose/xxx', stg: '...', dev: '...' },
      healthUrl: (env, cfg) => `${cfg.envs[env].apiHost}/health`,
      // Only needed if the Dockerfile itself fetches a private git-hosted dependency (e.g. `npm
      // install` resolving a `github:org/repo` devDependency) — forwarded to `docker buildx build
      // --ssh`. 'default' uses a running ssh-agent; 'default=/path/to/key' uses a raw key file
      // directly, no agent needed (the Dockerfile's own RUN step must itself use `--mount=type=ssh`).
      // dockerSsh: 'default',
      build: async ({ run, env, versionTag, log }) => {
        log.step('Generating spec...');
        run(['pnpm', '--filter', '@myapp/server', 'generate:spec']);
        log.step('Building...');
        run(['pnpm', '--filter', '@myapp/server', 'build'], { env: { ...process.env, BUILD_VERSION: versionTag, APP_ENV: env } });
      },
    },
    web: {
      webhooks: { prd: '...', stg: '...', dev: '...' },
      healthUrl: (env, cfg) => `https://${cfg.envs[env].host}/api/health`,
      dockerBuildArgs: (env, cfg) => ({ VITE_HOST: cfg.envs[env].host }),
      upstream: ['server'], // must be deploy/<env>-ready (or main, in sync) before web builds against it
      // dev can build against server's WIP branch as-is (still must be clean) — stg/prd still
      // require server to be at a real deploy/<env> bump or in-sync main.
      looseUpstreamEnvs: ['dev'],
      build: async ({ run, env, versionTag, log, config }) => {
        log.step('Generating spec...');
        run(['pnpm', '--filter', '@myapp/server', 'generate:spec']);
        log.step('Generating client...');
        run(['pnpm', '--filter', '@myapp/web', 'generate:client']);
        log.step('Building...');
        run(['pnpm', '--filter', '@myapp/web', 'build', '--logLevel', 'warn'], {
          env: { ...process.env, BUILD_VERSION: versionTag, APP_ENV: env, VITE_HOST: config.envs[env].host },
        });
      },
    },
  },

  // --- `ci-scripts build-sub-image <name> <env>`: content-hash-keyed images with no repo/branch/bump cycle. ---
  subImages: {
    tts: { dir: 'server/tts', parentService: 'server' }, // shares server's registry namespace + webhook
  },

  // --- `ci-scripts build-apk <env>`: optional Unity Android build. ---
  apk: {
    bumpProject: 'unity',              // must match a key in `bump`
    fileName: 'myapp.apk',
    packagePrefix: 'unity',            // GitLab generic package = `${packagePrefix}-${env}`
    unityProjectDir: 'unity',
    assetProjectDir: 'unity-asset',
    assetBranch: 'deploy/release',
    buildMethod: 'BuildScript.BuildAPK', // static method in your Unity project's build script
    upstream: 'server',
    looseUpstreamEnvs: ['dev'], // dev builds against server as-is (still must be clean) — see services.<name>.looseUpstreamEnvs
    specGenCommand: ['pnpm', '--filter', '@myapp/server', 'generate:spec'],
    apiClientFreshness: { // optional — skip if you don't generate a client into the Unity project
      lockFile: 'unity/scripts/specs.lock.json',
      specFiles: ['server/openapi/device-management.json', 'server/openapi/device-user.json'],
      regenerateHint: 'cd unity && pnpm generate:client',
    },
    keystore: { path: 'unity/myapp.keystore', alias: 'myapp', passEnv: 'MYAPP_KEYSTORE_PASS' },
    buildArgs: (cfg, env) => (['-apiBaseUrl', cfg.envs[env].apiHost, '-appEnv', env]),
    envs: {
      dev: { bundleId: 'com.myapp.dev', appName: 'MyApp Dev', dev: true },
      stg: { bundleId: 'com.myapp.stg', appName: 'MyApp Stg' },
      prd: { bundleId: 'com.myapp',     appName: 'MyApp' },
    },
  },

  // --- `ci-scripts dokploy-setup-env <env>`: provisions composes/domains/wildcard for a new env. ---
  // domainHost can return a single host or an array of hosts — each gets its own Dokploy domain,
  // all routed to the same compose/service/port (e.g. a host-based multi-tenant app serving several
  // custom domains from one deployment: domainHost: (host) => [host, 'other-domain.com']).
  dokploySetup: {
    postgres: { dockerImage: 'postgres:18', databaseName: 'myapp', databaseUser: 'myapp' }, // omit to skip
    composeServices: [
      {
        name: 'server',
        composeFile: 'server/docker-compose.yml',
        port: 3001,
        domainHost: (host) => `api.${host}`,
        // Keep values here stable across calls — `build` runs this on every invocation (via
        // dokploy-env-sync, not just at first provisioning) and pushes+redeploys whatever doesn't
        // match what's already live in Dokploy. `ctx.randomUUID()` inline would "drift" (and
        // rotate the secret, invalidating every live session) on every single build; generate it
        // once and read it from ci-scripts/.env instead — ctx.randomUUID is only safe for a value
        // truly meant to change on every call (rare).
        envVars: (env, ctx) => [
          `APP_ENV=${env}`,
          `SERVER_DATABASE_URL=postgresql://${ctx.db.databaseUser}:${ctx.db.databasePassword}@${ctx.db.appName}:5432/${ctx.db.databaseName}`,
          `SERVER_SECRET=${process.env.SERVER_SECRET}`,
        ].join('\n'),
      },
      {
        name: 'web',
        composeFile: 'web/docker-compose.yml',
        port: 3000,
        domainHost: (host) => host,
        envVars: (env) => `APP_ENV=${env}`,
        // Optional: name of a certificatesResolver already defined in Traefik's static config
        // (traefik.yml, via dokploy.updateTraefikConfig) — use when the domain's DNS lives outside
        // the account the global `letsencrypt` resolver's dnsChallenge is scoped to. Without this,
        // every domain gets the default global 'letsencrypt' resolver regardless of what else is
        // configured — Dokploy only honors a custom resolver when certificateType is 'custom'.
        // certResolver: 'letsencrypt-http',
        // Optional: Traefik middleware names to attach to this domain's router(s). Each name must
        // be defined elsewhere in the same Traefik provider Dokploy uses for this service — the
        // simplest way is a `traefik.http.middlewares.<name>.<...>=...` label directly on the
        // service in its docker-compose.yml (Traefik resolves same-provider middleware references
        // unqualified). Kept in sync on every `dokploy-setup-env` run, including for domains that
        // already exist.
        // middlewares: ['web-compress'],
      },
    ],
    wildcard: { targetService: 'web', port: 3000 }, // *.<host> -> web; omit to skip wildcard routing
  },
};

// --- Minimal single-repo, single-env, GitHub-registry example ---
// For a project that's just one repo, deploys to prod only, and has no branch-per-env ceremony.
// This file lives at <repo>/ci-scripts/config.mjs; the repo root itself (one level up) is the
// service. Dockerfile/docker-compose.yml are grouped under ci-scripts/ too, via the dockerfilePath/
// composeFilePath overrides — omit those two lines if you'd rather keep them at the repo root.
//
// export default {
//   dokploy: { projectName: 'MYSITE', /* url via DOKPLOY_URL */ },
//   envs: { prd: { host: 'example.com', apiHost: 'https://example.com' } },
//   bump: {},   // empty — `web` below has no bump entry, so `build` runs straight off main
//   services: {
//     web: {
//       dir: '.',   // the repo root (parent of ci-scripts/) IS the service's repo
//       dockerfilePath: 'ci-scripts/Dockerfile',
//       composeFilePath: 'ci-scripts/docker-compose.yml',
//       webhooks: { prd: 'https://dokploy.example.com/api/deploy/compose/xxx' },
//       healthUrl: (env, cfg) => `https://${cfg.envs[env].host}/api/health`,
//       build: async ({ run, env, versionTag, log }) => {
//         log.step('Building...');
//         run(['pnpm', 'build'], { env: { ...process.env, BUILD_VERSION: versionTag } });
//       },
//     },
//   },
//   dokploySetup: {
//     composeServices: [{
//       name: 'web', composeFile: 'ci-scripts/docker-compose.yml', port: 3000,
//       domainHost: (host) => host, envVars: (env) => `APP_ENV=${env}`,
//     }],
//   },
// };
