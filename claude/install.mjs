// Auto setup for a new machine: installs the Stop-hook notification
// (toast + sound) into the current user's Claude Code config.
// Usage: node claude/install.mjs

import { existsSync, mkdirSync, copyFileSync, readFileSync, writeFileSync } from "node:fs";
import { homedir, platform } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const sourceDir = dirname(fileURLToPath(import.meta.url));
const claudeDir = join(homedir(), ".claude");
mkdirSync(claudeDir, { recursive: true });

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

writeFileSync(settingsPath, JSON.stringify(settings, null, 2));

console.log(`Notification hook installed in ${claudeDir}`);
