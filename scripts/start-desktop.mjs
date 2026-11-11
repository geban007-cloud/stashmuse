import { chmodSync, cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";

const source = fileURLToPath(new URL("../", import.meta.url));
const runtimeRoot = path.join(process.env.HOME || "", "Library/Application Support/collector-universe-runtime");
const runtime = path.join(runtimeRoot, "project");
const secretsFile = process.env.COLLECTOR_SECRETS_FILE || path.join(runtimeRoot, "secrets/.dev.vars");
const isDesktopSource = process.platform === "darwin" && source.startsWith(path.join(process.env.HOME || "", "Desktop") + path.sep);

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}

function packageLockDigest(cwd) {
  const lock = path.join(cwd, "package-lock.json");
  return existsSync(lock) ? createHash("sha256").update(readFileSync(lock)).digest("hex") : "";
}

let cwd = source;
if (isDesktopSource) {
  mkdirSync(runtime, { recursive: true });
  console.log("正在将项目更新到本机运行目录…");
  run("rsync", ["-a", "--exclude=node_modules", "--exclude=dist", "--exclude=.wrangler", "--exclude=.next", "--exclude=.vinext", "--exclude=.sites-runtime", "--exclude=.playwright-cli", "--exclude=output", "--exclude=tsconfig.tsbuildinfo", `${source}/`, `${runtime}/`], source);
  if (existsSync(secretsFile)) {
    cpSync(secretsFile, path.join(runtime, ".dev.vars"));
    chmodSync(path.join(runtime, ".dev.vars"), 0o600);
  }
  const state = path.join(runtime, ".wrangler/state");
  if (!existsSync(state) && existsSync(path.join(source, ".wrangler/state"))) {
    mkdirSync(path.dirname(state), { recursive: true });
    cpSync(path.join(source, ".wrangler/state"), state, { recursive: true });
  }
  const dependencyStamp = path.join(runtime, "node_modules/.collector-package-lock");
  const lockDigest = packageLockDigest(runtime);
  const installedDigest = existsSync(dependencyStamp) ? readFileSync(dependencyStamp, "utf8").trim() : "";
  if (!existsSync(path.join(runtime, "node_modules/vinext")) || lockDigest !== installedDigest) {
    run("npm", ["ci", "--prefer-offline", "--no-audit", "--no-fund"], runtime);
    writeFileSync(dependencyStamp, `${lockDigest}\n`);
  }
  run("npm", ["run", "build"], runtime);
  cwd = runtime;
}

const child = spawn(process.execPath, ["scripts/start-local.mjs", ...process.argv.slice(2)], { cwd, stdio: "inherit" });
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
child.on("exit", (code) => { process.exitCode = code ?? 1; });
