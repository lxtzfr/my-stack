# Claude Code setup

Not a kit — maintainer tooling to bring a new machine's Claude Code up to
speed quickly: personal global instructions ([`global-instructions.md`](global-instructions.md))
and the Stop-hook notification (toast + sound) that fires when Claude
finishes responding. Platform-specific notification scripts live under
their own folder (currently only [`windows/`](windows), since that's the
only platform in use); `install.mjs` picks the right one for the current
OS.

`global-instructions.md` exists so personal Claude Code preferences
(behavior rules, not project-specific conventions — those stay in each
project's own `CLAUDE.md`) live in git instead of only in a given
machine's local `~/.claude/CLAUDE.md` — surviving a machine change
instead of being lost with it. Edit that file, not the synced block in
`~/.claude/CLAUDE.md` directly.

## Install

```sh
pnpm claude:setup
```

This merges `global-instructions.md`'s content into `~/.claude/CLAUDE.md`
(a delimited managed block, like `core/sync-conventions.mjs` uses in a
consuming project — re-running only touches that block, safe alongside
any other content already in the file), copies the platform's
notification scripts/sound into `~/.claude` (and the sound file into the
home dir), and wires the Stop hook into `~/.claude/settings.json` —
merging into any existing settings/hooks rather than overwriting them.
Running it again is a no-op if everything's already in place. On a
platform with no notification scripts yet, that part logs and exits
without changing anything (the instructions sync still runs).
