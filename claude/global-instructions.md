<!-- Personal Claude Code instructions, synced into ~/.claude/CLAUDE.md by
     claude/install.mjs (`pnpm claude:setup`) — kept here, in git, instead
     of only in local ~/.claude state, so they survive a machine change
     instead of being lost with it. -->

## Proactive refactor flagging

When touching code and noticing something that could be modified,
refactored, made more generic, or done differently — flag it to the user
or just make the change directly, instead of silently leaving it as-is.
While implementing a requested change, actively scan for other spots
following the same now-outdated pattern (grep for similar structures,
check sibling files/kits/consumers that touch the same shared piece) and
either fix them in the same pass or call them out explicitly before
declaring the task done — don't wait for the user to spot them one by
one after the fact.
