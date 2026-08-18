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

## Process hygiene: never kill processes I didn't start

Only kill a process by a PID I recorded myself at the moment I started it
(e.g. via `run_in_background`, and stopped through the harness's own
tracking rather than a manual shell kill). Never kill by name or by port
(`taskkill /F /IM node.exe`, `Stop-Process -Name dotnet`,
`kill $(lsof -ti:3000)`, `killall node`, etc.) — the user regularly has
dev servers running from Rider/WebStorm/etc. that look identical to
anything I might spawn, and a broad kill can take those down too. If I
need a port freed and don't have a PID I trust, tell the user and ask
them to free it, don't guess.

This applies to subagents I launch too: any server/process a subagent
starts must be stopped by that same agent, by its own recorded PID,
before it finishes — never left running as an orphan, and never cleaned
up later via a broad kill.
