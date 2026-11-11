import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const project = fileURLToPath(new URL("../", import.meta.url));
const base = "http://127.0.0.1:8787";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function jsonRequest(route, options) {
  const response = await fetch(`${base}${route}`, { ...options, signal: AbortSignal.timeout(15000) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || `${route} 返回 ${response.status}`);
  return result;
}

async function serverReady() {
  try {
    const response = await fetch(`${base}/api/delivery`, { signal: AbortSignal.timeout(2000) });
    return response.ok;
  } catch { return false; }
}

let server;
try {
  if (!(await serverReady())) {
    server = spawn(process.execPath, ["scripts/start-desktop.mjs", "--port", "8787"], { cwd: project, detached: true, stdio: "inherit" });
    let ready = false;
    for (let attempt = 0; attempt < 60; attempt++) {
      if (await serverReady()) { ready = true; break; }
      if (server.exitCode !== null) break;
      await sleep(2000);
    }
    if (!ready) throw new Error("本地服务未能在两分钟内启动");
  }

  const config = await jsonRequest("/api/delivery");
  if (!config.configured) throw new Error("缺少飞书机器人 Webhook；请在 .dev.vars 设置 FEISHU_WEBHOOK_URL 后重启本地服务");
  if (process.argv.includes("--check")) {
    console.log("飞书机器人配置就绪");
  } else {
    await jsonRequest("/api/digest/today");
    const result = await jsonRequest("/api/delivery/send", { method: "POST" });
    console.log(result.skipped ? result.message : `已发送 ${result.count} 张知识卡片至飞书群`);
  }
} catch (error) {
  console.error(`[${new Date().toISOString()}] 每日飞书推送失败：${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
} finally {
  if (server?.pid) {
    try { process.kill(-server.pid, "SIGTERM"); } catch { /* The server already stopped. */ }
  }
}
