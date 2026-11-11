import { spawn } from "node:child_process";
import { copyFileSync, existsSync } from "node:fs";

// Wrangler loads .dev.vars automatically for local development. Do not copy
// credentials into --var arguments: process listings expose command-line args.
// With a generated config under dist/server, its .dev.vars must live there.
if (existsSync(".dev.vars")) copyFileSync(".dev.vars", "dist/server/.dev.vars");
const args = [
  "--import", "./scripts/sites-env.mjs",
  "./node_modules/wrangler/bin/wrangler.js", "dev",
  "--config", "dist/server/wrangler.json",
  "--local", "--persist-to", ".wrangler/state", "--ip", "127.0.0.1", "--inspector-port", "0",
];
args.push(...process.argv.slice(2));

const child = spawn(process.execPath, args, { stdio: "inherit" });
child.on("exit", (code) => { process.exitCode = code ?? 1; });
