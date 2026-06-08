const { existsSync } = require("node:fs");
const { execFileSync } = require("node:child_process");
const { join, resolve } = require("node:path");

module.exports = async function afterPackIcon(context) {
  if (context.electronPlatformName !== "win32") return;

  const projectDir = context.packager.projectDir;
  const exePath = join(context.appOutDir, "GitHubResearch.exe");
  const iconPath = resolve(projectDir, "build", "icon.ico");
  const rceditPath = resolve(projectDir, "node_modules", "electron-winstaller", "vendor", "rcedit.exe");

  if (!existsSync(exePath) || !existsSync(iconPath) || !existsSync(rceditPath)) {
    console.warn("[afterPackIcon] Skipping Windows icon resource patch; required file is missing.", {
      exePath,
      iconPath,
      rceditPath
    });
    return;
  }

  execFileSync(rceditPath, [
    exePath,
    "--set-icon", iconPath,
    "--set-version-string", "FileDescription", "GitHubResearch",
    "--set-version-string", "ProductName", "GitHubResearch",
    "--set-version-string", "InternalName", "GitHubResearch",
    "--set-version-string", "OriginalFilename", "GitHubResearch.exe"
  ], { stdio: "inherit" });

  console.log("[afterPackIcon] Patched Windows executable icon and version resources.");
};
