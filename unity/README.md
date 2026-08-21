# fr.lxtz.my-stack-unity

Install/update tooling for Unity projects — a canonical `.gitattributes`
(LFS filters for 3D/audio/video/image binaries, the `unityyamlmerge`
driver for scenes/prefabs/etc., C# diffing) and a common `.gitignore`
baseline (the well-known [github/gitignore Unity.gitignore](https://github.com/github/gitignore/blob/main/Unity.gitignore)
body), synced into every consuming project so they don't drift apart —
plus a dockerized OpenAPI-to-C#-client generator with the two fixes every
consumer needs (GUID-stable regeneration, stripping the Polly dependency
Unity's runtime doesn't have). No runtime C# yet — see "Not in here (on
purpose)" below.

Unlike the npm-based kits (`tanstack`, `nestjs`), this is a **UPM
package**, not an npm one — Unity isn't an npm ecosystem, so this folder
has no dependency on `@lxtzfr/my-stack-core` and isn't part of the pnpm
workspace. It ships its own bespoke, self-contained sync script instead.

## What's in here

- **`templates/gitattributes`** — the canonical ruleset: LFS for 3D
  models, audio, video, images, fonts, archives, ...; `unityyamlmerge`
  for scenes/prefabs/materials/etc.; C# diffing. Identical today across
  every TRA-SIM Unity repo — this is a real shared rule, not a per-project
  guess.
- **`templates/gitignore`** — the common Unity project baseline
  (`Library/`, `Temp/`, `Logs/`, `UserSettings/`, IDE cruft, Addressables
  and Visual Scripting generated files, ...). Project-specific ignores
  stay out of this file — add them below the managed block in your own
  `.gitignore` instead.
- **`scripts/sync-conventions.mjs`** — writes both templates (plus a
  `CLAUDE.md` conventions pointer) into the consuming project as managed,
  delimited blocks, and runs `git lfs install`. Re-running only touches
  its own blocks — safe to re-run any time, and idempotent.
- **`scripts/generate-openapi-client.mjs`** — `generateOpenApiClient(s)` +
  `writeSpecsLock`, exported functions (not a config file — UPM has no
  config-discovery convention the way `ci-scripts` does) a consuming
  project's own thin `scripts/generate-client.mjs` wrapper calls with its
  own spec/output paths. Runs `openapitools/openapi-generator-cli` via
  Docker (no local Java/generator install), regenerates without churning
  `.meta` GUIDs for files whose content didn't change (diffs the file list
  before/after instead of wiping the output dir first), and strips the
  `Polly` dependency the `csharp` generator bakes into `ApiClient.cs` by
  default — not available in Unity's C# runtime. `writeSpecsLock` pairs
  with `ci-scripts`' `assertGeneratedClientFresh` (`shared/publish-guard.mjs`)
  to catch a build running against a client whose upstream specs changed
  since it was last regenerated.

## Install

Add to the consuming Unity project's `Packages/manifest.json`:

```json
{
  "dependencies": {
    "fr.lxtz.my-stack-unity": "https://github.com/lxtzfr/my-stack.git?path=unity#main"
  }
}
```

(Or **Window → Package Manager → + → Add package from git URL...** with
the same URL.) Pin to a commit or tag instead of `#main` for anything
beyond local experimentation, the same way `unity`'s own manifest pins
`com.trasim.unity-assets` to `deploy/release`.

Then, from the consuming project's root (once, and again any time you
want to pick up a template change):

```sh
node Packages/fr.lxtz.my-stack-unity/scripts/sync-conventions.mjs
```

(Path depends on how Unity resolved the git dependency — under
`Library/PackageCache/fr.lxtz.my-stack-unity@<hash>/` for a plain git
dependency, or `Packages/my-stack-unity/` if embedded via **Package
Manager → ... → Embed**.) Unlike the npm kits, nothing runs this
automatically — Unity/UPM has no `postinstall` equivalent.

## Generating an OpenAPI client

Your project's own `scripts/generate-client.mjs` (whatever runs your
`generate:client` package.json script) imports and calls this package's
functions with your own layout — e.g. TRA-SIM's `unity/scripts/generate-client.mjs`:

```js
import { generateOpenApiClients, writeSpecsLock } from 'fr.lxtz.my-stack-unity/scripts/generate-openapi-client.mjs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const WORKSPACE_ROOT = join(SCRIPT_DIR, '..', '..') // mounted into the container as /workspace

generateOpenApiClients({
  workspaceRoot: WORKSPACE_ROOT,
  clients: [
    { specPath: 'server/openapi/device-management.json', outputDir: 'unity/Assets/API/Management', packageName: 'DeviceManagementApi', asmdefName: 'Trasim.Api.Management' },
    { specPath: 'server/openapi/device-user.json',       outputDir: 'unity/Assets/API/User',       packageName: 'DeviceUserApi',       asmdefName: 'Trasim.Api.User' },
  ],
})

writeSpecsLock(
  join(SCRIPT_DIR, 'specs.lock.json'),
  ['server/openapi/device-management.json', 'server/openapi/device-user.json'].map(p => join(WORKSPACE_ROOT, p)),
)
```

## Not in here (on purpose)

Runtime C# (helpers, components, systems the consuming project actually
imports at play/edit time) — not written yet. Once there's real,
genuinely cross-project code to extract (the way `nestjs` generalized
`server`'s own request-context/logging/exception-filter boilerplate),
it'll live under a `Runtime/` (and `Editor/`) folder here with its own
`.asmdef`, following standard UPM package layout. Business logic, art
assets, and anything specific to what a particular training module is
about stay in the consuming project (or `unity-asset`) — never here.
