# com.lxtzfr.my-stack-unity

Install/update tooling for Unity projects — a canonical `.gitattributes`
(LFS filters for 3D/audio/video/image binaries, the `unityyamlmerge`
driver for scenes/prefabs/etc., C# diffing) and a common `.gitignore`
baseline (the well-known [github/gitignore Unity.gitignore](https://github.com/github/gitignore/blob/main/Unity.gitignore)
body), synced into every consuming project so they don't drift apart. No
runtime C# yet — see "Not in here (on purpose)" below.

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

## Install

Add to the consuming Unity project's `Packages/manifest.json`:

```json
{
  "dependencies": {
    "com.lxtzfr.my-stack-unity": "https://github.com/lxtzfr/my-stack.git?path=unity#main"
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
node Packages/com.lxtzfr.my-stack-unity/scripts/sync-conventions.mjs
```

(Path depends on how Unity resolved the git dependency — under
`Library/PackageCache/com.lxtzfr.my-stack-unity@<hash>/` for a plain git
dependency, or `Packages/my-stack-unity/` if embedded via **Package
Manager → ... → Embed**.) Unlike the npm kits, nothing runs this
automatically — Unity/UPM has no `postinstall` equivalent.

## Not in here (on purpose)

Runtime C# (helpers, components, systems the consuming project actually
imports at play/edit time) — not written yet. Once there's real,
genuinely cross-project code to extract (the way `nestjs` generalized
`server`'s own request-context/logging/exception-filter boilerplate),
it'll live under a `Runtime/` (and `Editor/`) folder here with its own
`.asmdef`, following standard UPM package layout. Business logic, art
assets, and anything specific to what a particular training module is
about stay in the consuming project (or `unity-asset`) — never here.
