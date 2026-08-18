// Auto setup for a new machine: installs the Stop-hook notification
// (toast + sound) and personal global instructions into the current
// user's Claude Code config.
// Usage: node claude/install.mjs

import { existsSync, mkdirSync, copyFileSync, readFileSync, writeFileSync } from "node:fs";
import { homedir, platform } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const sourceDir = dirname(fileURLToPath(import.meta.url));
const claudeDir = join(homedir(), ".claude");
mkdirSync(claudeDir, { recursive: true });

// Merges `wrapped` (already including its own start/end markers) into
// `path`, replacing a previous run's block if the markers are found,
// appending otherwise, creating the file if it doesn't exist yet — same
// idempotent convention as core/sync-conventions.mjs's syncManagedBlock,
// duplicated here rather than shared since this script has to run with
// zero dependencies (postinstall-free, plain `node claude/install.mjs`).
function syncManagedBlock(path, start, end, body) {
  const wrapped = `${start}\n${body}\n${end}`;
  const existing = existsSync(path) ? readFileSync(path, "utf8") : "";

  let next;
  if (existing.includes(start) && existing.includes(end)) {
    const before = existing.slice(0, existing.indexOf(start));
    const after = existing.slice(existing.indexOf(end) + end.length);
    next = `${before}${wrapped}${after}`;
  } else if (existing.trim().length > 0) {
    next = `${existing.trimEnd()}\n\n${wrapped}\n`;
  } else {
    next = `${wrapped}\n`;
  }

  if (next === existing) return false;
  writeFileSync(path, next, "utf8");
  return true;
}

const START = "<!-- my-stack:global-instructions:start -->";
const END = "<!-- my-stack:global-instructions:end -->";
const instructions = readFileSync(join(sourceDir, "global-instructions.md"), "utf8").trim();
const body = `<!-- Managed by my-stack/claude/install.mjs — edit claude/global-instructions.md in the my-stack repo, not this block directly. -->\n\n${instructions}`;

const claudeMdPath = join(claudeDir, "CLAUDE.md");
if (syncManagedBlock(claudeMdPath, START, END, body)) {
  console.log(`Global instructions synced into ${claudeMdPath}`);
}

if (platform() !== "win32") {
  console.log(`No notification setup for platform "${platform()}" yet — skipping.`);
  process.exit(0);
}

const winDir = join(sourceDir, "windows");

copyFileSync(join(winDir, "show-notification.ps1"), join(claudeDir, "show-notification.ps1"));
copyFileSync(join(winDir, "play-notification.ps1"), join(claudeDir, "play-notification.ps1"));
copyFileSync(join(winDir, "notification.mp3"), join(homedir(), "notification.mp3"));

const settingsPath = join(claudeDir, "settings.json");
const settings = existsSync(settingsPath)
  ? JSON.parse(readFileSync(settingsPath, "utf8"))
  : {};

settings.hooks ??= {};
settings.hooks.Stop ??= [];
settings.hooks.SessionStart ??= [];

const hookCommand = (script) => ({
  type: "command",
  command: "powershell",
  args: ["-sta", "-noprofile", "-file", join(claudeDir, script)],
  async: true,
});

const alreadyWired = settings.hooks.Stop.some((entry) =>
  entry.hooks?.some((hook) => hook.args?.some((arg) => arg.includes("show-notification.ps1"))),
);

if (!alreadyWired) {
  settings.hooks.Stop.push({
    hooks: [hookCommand("show-notification.ps1"), hookCommand("play-notification.ps1")],
  });
}

// Warns at the start of every session, in whatever project it's opened in,
// if that project's @lxtzfr/my-stack-* packages are locked to a stale
// commit — see core/check-freshness.mjs. Points at this repo's own
// checkout rather than a copy, so editing the script takes effect on the
// next session without re-running install.mjs.
const checkFreshnessPath = join(sourceDir, "..", "core", "check-freshness.mjs");
const freshnessAlreadyWired = settings.hooks.SessionStart.some((entry) =>
  entry.hooks?.some((hook) => hook.args?.some((arg) => arg.includes("check-freshness.mjs"))),
);

if (!freshnessAlreadyWired) {
  settings.hooks.SessionStart.push({
    hooks: [{ type: "command", command: "node", args: [checkFreshnessPath], timeout: 5 }],
  });
}

writeFileSync(settingsPath, JSON.stringify(settings, null, 2));

console.log(`Notification hook installed in ${claudeDir}`);
