# unity

Not built yet, and not an npm package — Unity isn't an npm ecosystem, so
this folder has no `package.json` and isn't part of the pnpm workspace.

Planned split, once built:

- **Install/update tooling** — plain JS/Node (via
  [`shared/`](../shared)-style tooling), since Unity has no equivalent of
  `postinstall`. A consumer runs a sync script by hand (or a `.bat`/`.sh`
  wrapper) rather than it firing automatically on package install.
- **Runtime code** (helpers, components, systems the consuming Unity
  project actually imports) — written in C#, since JS doesn't run in the
  Unity/Mono runtime.

See the root [README](../README.md) for the shared philosophy across all
`my-stack` kits.
