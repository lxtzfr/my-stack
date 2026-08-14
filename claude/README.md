# Claude Code setup

Not a kit — maintainer tooling to bring a new machine's Claude Code up to
speed quickly, in particular the Stop-hook notification (toast + sound)
that fires when Claude finishes responding. Platform-specific scripts
live under their own folder (currently only [`windows/`](windows), since
that's the only platform in use); `install.mjs` picks the right one for
the current OS.

## Install

```sh
pnpm claude:setup
```

This copies the platform's notification scripts/sound into
`~/.claude` (and the sound file into the home dir), and wires the Stop
hook into `~/.claude/settings.json` — merging into any existing
settings/hooks rather than overwriting them. Running it again is a
no-op if the hook is already wired. On a platform with no scripts yet,
it logs and exits without changing anything.
