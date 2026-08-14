# shared

Maintainer-only tooling shared across `my-stack` kits. **Not** a runtime
dependency of any kit — see the "why not a real dependency" note in the
root README for the reasoning (npm's `path:` subdirectory install only
fetches the referenced kit folder, so a kit can't `import` from `shared/`
at install time).

Instead, `shared/sync-conventions.template.mjs` is the canonical, kit-name-
parameterized version of the install/update tooling (CLAUDE.md conventions
pointer + `.gitattributes` line-ending rule). Run the generator after
editing it:

```sh
node shared/sync-to-kits.mjs
```

This overwrites each kit's own `scripts/sync-conventions.mjs` with a fresh,
fully self-contained copy (package name substituted in). Add new kits to
the `kits` array in `sync-to-kits.mjs` as they're built out.
