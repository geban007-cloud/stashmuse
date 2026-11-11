import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";

if (process.platform !== "darwin") throw new Error("此安装脚本只支持 macOS launchd");

const label = "com.collector-universe.daily-feishu";
const project = fileURLToPath(new URL("../", import.meta.url));
const agents = path.join(os.homedir(), "Library/LaunchAgents");
const logs = path.join(os.homedir(), "Library/Logs/CollectorUniverse");
const plist = path.join(agents, `${label}.plist`);
const previousPlist = path.join(agents, "com.collector-universe.daily-email.plist");
const escapeXml = (value) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

mkdirSync(agents, { recursive: true });
mkdirSync(logs, { recursive: true });
writeFileSync(plist, `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>${label}</string>
  <key>ProgramArguments</key><array><string>${escapeXml(process.execPath)}</string><string>${escapeXml(path.join(project, "scripts/send-daily-feishu.mjs"))}</string></array>
  <key>WorkingDirectory</key><string>${escapeXml(project)}</string>
  <key>EnvironmentVariables</key><dict>
    <key>HOME</key><string>${escapeXml(os.homedir())}</string>
    <key>PATH</key><string>${escapeXml(`${path.dirname(process.execPath)}:/usr/bin:/bin:/usr/sbin:/sbin`)}</string>
  </dict>
  <key>StartCalendarInterval</key><dict><key>Hour</key><integer>9</integer><key>Minute</key><integer>0</integer></dict>
  <key>StandardOutPath</key><string>${escapeXml(path.join(logs, "daily-feishu.log"))}</string>
  <key>StandardErrorPath</key><string>${escapeXml(path.join(logs, "daily-feishu-error.log"))}</string>
</dict></plist>
`, { mode: 0o600 });

const domain = `gui/${process.getuid()}`;
try { execFileSync("launchctl", ["bootout", domain, plist], { stdio: "ignore" }); } catch { /* Not previously installed. */ }
try { execFileSync("launchctl", ["bootout", domain, previousPlist], { stdio: "ignore" }); } catch { /* Old email task was not installed. */ }
try { unlinkSync(previousPlist); } catch (error) { if (error.code !== "ENOENT") throw error; }
execFileSync("launchctl", ["bootstrap", domain, plist], { stdio: "pipe" });
console.log(`每日 09:00 飞书推送任务已安装：${plist}`);
