async function updateStatus(tabId, message) {
  await chrome.storage.local.set({ [`syncStatus:${tabId}`]: message });
  chrome.runtime.sendMessage({ type: "sync:status", tabId, message }).catch(() => undefined);
  chrome.tabs.sendMessage(tabId, { type: "collection:zhihu-status", message }).catch(() => undefined);
}

async function sendToTab(tabId, message) {
  return chrome.tabs.sendMessage(tabId, message);
}

async function currentCollector(tabId) {
  try { return await sendToTab(tabId, { type: "collection:get" }); } catch { return null; }
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function importItems(endpoint, token, items) {
  const response = await fetch(`${endpoint}/api/extension/import`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-collection-token": token },
    body: JSON.stringify({ items }),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "同步失败");
  return payload;
}

async function collectTab(tabId, platform, statusMessage) {
  await sendToTab(tabId, { type: "collection:reset" });
  let pages = 1;
  const visitedPages = new Set();
  for (let step = 0; step < 180; step += 1) {
    let result;
    try {
      result = await sendToTab(tabId, { type: "collection:auto-step" });
    } catch {
      await wait(900);
      continue;
    }
    await statusMessage(`正在采集 ${platform}：已发现 ${result.count} 条${pages > 1 ? `，第 ${pages} 页` : ""}…`);
    if (result.reachedEnd && visitedPages.has(result.pageMarker)) break;
    if (!result.reachedEnd) {
      await wait(600);
      continue;
    }
    visitedPages.add(result.pageMarker);
    if (!result.nextAvailable || pages >= 80) break;
    const next = await sendToTab(tabId, { type: "collection:auto-next" }).catch(() => ({ clicked: false }));
    if (!next.clicked) break;
    pages += 1;
    await wait(platform === "B站" ? 1800 : 1200);
  }
  const collected = await currentCollector(tabId);
  return collected?.items?.filter((item) => item.title?.trim()) || [];
}

function platformForUrl(url) {
  try {
    const host = new URL(url).hostname;
    if (host.includes("xiaohongshu")) return "小红书";
    if (host.includes("bilibili")) return "B站";
    if (host.includes("zhihu")) return "知乎";
    if (host.endsWith("weibo.com")) return "微博";
  } catch { /* Ignore tabs without a normal URL. */ }
  return null;
}

function isFavoritePage(tab, platform) {
  const url = String(tab.url || "");
  const title = String(tab.title || "");
  if (/收藏|收藏夹|favorite|favlist/i.test(`${url} ${title}`)) return true;
  if (platform === "小红书") return /\/user\/profile\/[^/]+\/(?:collections?|favorites?)/i.test(url);
  if (platform === "B站") return /\/favlist(?:[/?#]|$)/i.test(url);
  if (platform === "知乎") return /\/collections?(?:[/?#]|$)|\/collection\/\d+/i.test(url);
  if (platform === "微博") return /\/(?:favorites?|fav|my\/fav|u\/[^/]+\/fav)(?:[/?#]|$)/i.test(url);
  return false;
}

async function updateAllStatus(message) {
  await chrome.storage.local.set({ syncAllStatus: message });
  chrome.runtime.sendMessage({ type: "sync:all-status", message }).catch(() => undefined);
}

async function waitForZhihuJob(tabId, timeout = 20 * 60 * 1000) {
  const key = `zhihuSyncJob:${tabId}`;
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const value = await chrome.storage.local.get([key, `syncStatus:${tabId}`]);
    if (!value[key]) return value[`syncStatus:${tabId}`] || "知乎同步已结束";
    await wait(1000);
  }
  throw new Error("知乎同步等待超时，请查看知乎页面右下角状态。");
}

let syncAllRunning = false;
async function runAllSync() {
  if (syncAllRunning) return;
  syncAllRunning = true;
  try {
    const settings = await chrome.storage.local.get(["endpoint", "token"]);
    const endpoint = String(settings.endpoint || "").replace(/\/$/, "");
    const token = String(settings.token || "");
    if (!endpoint || !token) throw new Error("本地服务地址或配对码缺失，请先完成配对。");
    const tabs = await chrome.tabs.query({});
    const targets = tabs.filter((tab) => {
      const platform = platformForUrl(tab.url || "");
      return tab.id && platform && isFavoritePage(tab, platform);
    });
    if (!targets.length) throw new Error("没有找到已打开的平台页面，请先打开收藏页。");

    const totals = { created: 0, updated: 0, skipped: 0, tabs: 0 };
    await updateAllStatus(`已找到 ${targets.length} 个平台页面，开始同步…`);
    for (const tab of targets) {
      const platform = platformForUrl(tab.url || "");
      if (platform === "知乎") {
        const jobKey = `zhihuSyncJob:${tab.id}`;
        await chrome.storage.local.remove(`zhihuSyncResult:${tab.id}`);
        await chrome.storage.local.set({ [jobKey]: { startedAt: Date.now(), crossPlatform: true } });
        await updateAllStatus("正在同步知乎收藏夹…");
        try {
          await sendToTab(tab.id, { type: "collection:zhihu-start" });
          const finalStatus = await waitForZhihuJob(tab.id);
          const resultKey = `zhihuSyncResult:${tab.id}`;
          const result = await chrome.storage.local.get(resultKey);
          totals.created += result[resultKey]?.created || 0;
          totals.updated += result[resultKey]?.updated || 0;
          totals.skipped += result[resultKey]?.skipped || 0;
          await chrome.storage.local.remove(resultKey);
          if (/失败|超时|没有发现/.test(finalStatus)) throw new Error(finalStatus);
        } catch (error) {
          await chrome.storage.local.remove(jobKey);
          await updateAllStatus(`知乎同步失败：${error instanceof Error ? error.message : "请检查知乎页面"}`);
        }
        totals.tabs += 1;
        continue;
      }

      await updateAllStatus(`正在同步 ${platform}…`);
      try {
        const items = await collectTab(tab.id, platform, updateAllStatus);
        if (!items.length) {
          await updateAllStatus(`${platform} 未发现可整理内容，继续下一个平台…`);
          continue;
        }
        const payload = await importItems(endpoint, token, items);
        totals.created += payload.created?.length || 0;
        totals.updated += payload.updated?.length || 0;
        totals.skipped += payload.skipped || 0;
        totals.tabs += 1;
      } catch (error) {
        await updateAllStatus(`${platform} 同步失败，继续下一个平台：${error instanceof Error ? error.message : "未知错误"}`);
      }
    }
    await updateAllStatus(`跨平台同步完成：已处理 ${totals.tabs} 个页面，新增 ${totals.created} 条，更新 ${totals.updated} 条，排除 ${totals.skipped} 条。`);
  } catch (error) {
    await updateAllStatus(error instanceof Error ? error.message : "跨平台同步失败，请重试。");
  } finally {
    syncAllRunning = false;
  }
}

async function importZhihuItems(tabId, items) {
  const jobKey = `zhihuSyncJob:${tabId}`;
  const job = await chrome.storage.local.get(jobKey);
  if (!job[jobKey]) return;

  try {
    const settings = await chrome.storage.local.get(["endpoint", "token"]);
    const endpoint = String(settings.endpoint || "").replace(/\/$/, "");
    const token = String(settings.token || "");
    if (!endpoint || !token) throw new Error("本地服务地址或配对码缺失，请重新打开扩展后再试。");
    if (!items?.length) throw new Error("知乎采集完成，但没有发现可整理内容。");
    await updateStatus(tabId, `知乎采集完成，共 ${items.length} 条，正在导入并自动分类…`);
    const response = await fetch(`${endpoint}/api/extension/import`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-collection-token": token },
      body: JSON.stringify({ items }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "同步失败");
    await chrome.storage.local.set({ [`zhihuSyncResult:${tabId}`]: {
      created: payload.created?.length || 0,
      updated: payload.updated?.length || 0,
      skipped: payload.skipped || 0,
    } });
    await updateStatus(tabId, `知乎同步完成：新增 ${payload.created.length} 条，更新 ${payload.updated.length} 条，排除 ${payload.skipped || 0} 条${payload.autoOrganized ? "，已自动分类并保留" : ""}。`);
  } catch (error) {
    await updateStatus(tabId, error instanceof Error ? error.message : "知乎同步失败，请重试。");
  } finally {
    await chrome.storage.local.remove(jobKey);
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "sync:all-start") {
    void (async () => {
      if (message.endpoint || message.token) await chrome.storage.local.set({ endpoint: message.endpoint, token: message.token });
      await runAllSync();
    })();
    sendResponse({ started: true });
    return true;
  }
  if (message?.type === "sync:zhihu-start") {
    const jobKey = `zhihuSyncJob:${message.tabId}`;
    void (async () => {
      await chrome.storage.local.set({ [jobKey]: { startedAt: Date.now() } });
      await updateStatus(message.tabId, "正在读取知乎收藏夹…");
      try {
        await chrome.tabs.sendMessage(message.tabId, { type: "collection:zhihu-start" });
      } catch {
        await chrome.storage.local.remove(jobKey);
        await updateStatus(message.tabId, "页面采集器尚未启动。请刷新知乎页面后重试。");
      }
      sendResponse({ started: true });
    })();
    return true;
  }
  const tabId = sender.tab?.id;
  if (message?.type === "collection:zhihu-progress" && tabId != null) void updateStatus(tabId, message.message);
  if (message?.type === "collection:zhihu-finished" && tabId != null) void importZhihuItems(tabId, message.items);
});
