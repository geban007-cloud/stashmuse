const $ = (id) => document.getElementById(id);
const status = (message) => { $("status").textContent = message; };
const count = (message) => { $("count").textContent = message; };

// This function is intentionally self-contained because Chrome serializes it into the page's MAIN world.
// 小红书's list titles are held in window.__INITIAL_STATE__, not always rendered in virtualized card DOM.
function extractXhsState() {
  const state = window.__INITIAL_STATE__;
  if (!state || typeof state !== "object") return { items: [], selfAuthors: [], selfUserIds: [] };
  const unwrap = (value) => {
    let current = value;
    for (let index = 0; index < 3 && current && typeof current === "object" && !Array.isArray(current); index += 1) {
      if (Object.prototype.hasOwnProperty.call(current, "_rawValue")) current = current._rawValue;
      else if (Object.prototype.hasOwnProperty.call(current, "value")) current = current.value;
      else break;
    }
    return current;
  };
  const cards = [];
  const unavailableTitle = /内容不存在|该内容已被删除|笔记不存在|内容不可见|已被删除|已隐藏|已失效|无法查看|暂时无法查看|页面不存在|404/i;
  const selfAuthors = new Set();
  const selfUserIds = new Set();
  const addProfile = (profile) => {
    const current = unwrap(profile);
    if (!current || typeof current !== "object" || Array.isArray(current)) return;
    [current.nickname, current.nickName, current.userName, current.username, current.name].forEach((value) => {
      if (typeof value === "string" && value.trim()) selfAuthors.add(value.trim());
    });
    [current.userId, current.userid, current.user_id, current.id].forEach((value) => {
      if (typeof value === "string" || typeof value === "number") selfUserIds.add(String(value));
    });
  };
  [state.user, state.user?.user, state.user?.userInfo, state.user?.basicInfo, state.user?.profile, state.userInfo, state.currentUser, state.current_user].forEach(addProfile);
  const visited = new WeakSet();
  const find = (value, depth = 0) => {
    if (!value || depth > 6) return;
    const current = unwrap(value);
    if (!current || typeof current !== "object") return;
    if (visited.has(current)) return;
    visited.add(current);
    if (Array.isArray(current)) { current.forEach((entry) => find(entry, depth + 1)); return; }
    if (current.noteCard && current.id) cards.push(current);
    ["notes", "list", "items", "data", "favorites", "note", "feeds"].forEach((key) => find(current[key], depth + 1));
  };
  find(state.user?.favorites); find(state.favorites); find(state.user?.notes); find(state.note);
  const result = new Map();
  cards.forEach((entry) => {
    const card = entry.noteCard || {};
    const id = String(entry.id || card.noteId || "");
    const title = String(card.displayTitle || card.title || "").replace(/\s+/g, " ").trim();
    if (!id || !title || unavailableTitle.test(title)) return;
    const profile = unwrap(card.user);
    const author = String(profile?.nickname || profile?.nickName || "").trim();
    const authorId = profile?.userId ?? profile?.userid ?? profile?.user_id;
    const isOwnContent = (author && selfAuthors.has(author)) || (authorId != null && selfUserIds.has(String(authorId))) || Boolean(card.isOwnContent || card.isMine || entry.isOwnContent);
    const isUnavailable = Boolean(card.isDeleted || card.deleted || card.hidden || card.isHidden || entry.isDeleted || entry.deleted || entry.hidden);
    if (isOwnContent || isUnavailable) return;
    const token = entry.xsecToken ? `?xsec_token=${encodeURIComponent(entry.xsecToken)}&xsec_source=pc_feed` : "";
    result.set(`小红书:${id}`, {
      platform: "小红书", sourceType: "favorite", sourceKey: `小红书:${id}`,
      url: `https://www.xiaohongshu.com/explore/${id}${token}`, title,
      author,
      coverUrl: card.cover?.urlDefault || "", contentType: card.type === "video" ? "video" : "link",
      excerpt: String(card.desc || card.displayTitle || "").replace(/\s+/g, " ").trim(),
    });
  });
  return { items: [...result.values()], selfAuthors: [...selfAuthors], selfUserIds: [...selfUserIds] };
}

async function currentCollector(tabId) {
  try { return await chrome.tabs.sendMessage(tabId, { type: "collection:get" }); } catch { return null; }
}

function wait(milliseconds) { return new Promise((resolve) => window.setTimeout(resolve, milliseconds)); }

async function sendToTab(tabId, message) {
  return chrome.tabs.sendMessage(tabId, message);
}

async function waitForCollector(tabId, attempts = 16) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const collected = await currentCollector(tabId);
    if (collected) return collected;
    await wait(600);
  }
  return null;
}

async function collectCurrentPages(tabId, updateStatus, collectionLabel = "") {
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
    updateStatus(`正在自动采集 ${result.platform}${collectionLabel ? `「${collectionLabel}」` : ""}：已发现 ${result.count} 条${pages > 1 ? `，第 ${pages} 页` : ""}…`);
    if (result.reachedEnd && visitedPages.has(result.pageMarker)) {
      updateStatus("检测到已访问页面，已停止翻页并准备导入。");
      break;
    }
    if (!result.reachedEnd) {
      await wait(600);
      continue;
    }
    visitedPages.add(result.pageMarker);
    if (!result.nextAvailable || pages >= 80) break;
    const next = await sendToTab(tabId, { type: "collection:auto-next" }).catch(() => ({ clicked: false }));
    if (!next.clicked) break;
    pages += 1;
    updateStatus(`正在进入 ${result.platform} 第 ${pages} 页…`);
    await wait(result.platform === "B站" ? 1800 : 1200);
  }
  return currentCollector(tabId);
}

async function collectZhihuFolders(tabId, updateStatus, context) {
  if (context.isCollection) {
    const name = context.currentCollection || "知乎收藏夹";
    await sendToTab(tabId, { type: "collection:set-source-collection", name });
    return collectCurrentPages(tabId, updateStatus, name);
  }

  const folders = context.folders || [];
  if (!folders.length) {
    const name = context.currentCollection || "知乎收藏夹";
    await sendToTab(tabId, { type: "collection:set-source-collection", name });
    return collectCurrentPages(tabId, updateStatus, name);
  }

  for (let index = 0; index < folders.length; index += 1) {
    const folder = folders[index];
    updateStatus(`正在进入知乎收藏夹 ${index + 1}/${folders.length}：${folder.name}…`);
    await sendToTab(tabId, { type: "collection:set-source-collection", name: folder.name });
    await sendToTab(tabId, { type: "collection:navigate", url: folder.url });
    const ready = await waitForCollector(tabId);
    if (!ready) throw new Error(`无法打开知乎收藏夹「${folder.name}」。请刷新知乎页面后重试。`);
    await collectCurrentPages(tabId, updateStatus, folder.name);
  }
  return currentCollector(tabId);
}

async function autoCollect(tabId, updateStatus) {
  await sendToTab(tabId, { type: "collection:reset" });
  const initial = await waitForCollector(tabId);
  if (!initial) return { error: "页面采集器尚未启动。请刷新收藏页后重试。" };
  if (initial.platform !== "知乎") return collectCurrentPages(tabId, updateStatus);

  const context = await sendToTab(tabId, { type: "collection:zhihu-collections" });
  return collectZhihuFolders(tabId, updateStatus, context);
}

function mergeItems(collected, richItems) {
  const merged = new Map();
  [...collected, ...richItems].forEach((item) => {
    if (!item?.sourceKey) return;
    const previous = merged.get(item.sourceKey);
    merged.set(item.sourceKey, previous ? {
      ...previous,
      ...item,
      title: item.title || previous.title || "",
      author: item.author || previous.author || "",
      coverUrl: item.coverUrl || previous.coverUrl || "",
      excerpt: item.excerpt || previous.excerpt || "",
    } : item);
  });
  return [...merged.values()].filter((item) => item.title?.trim());
}

async function richXhsItems(tab) {
  if (!tab.url?.includes("xiaohongshu.com")) return [];
  try {
    const result = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: extractXhsState, world: "MAIN" });
    return result[0]?.result || { items: [], selfAuthors: [], selfUserIds: [] };
  } catch { return []; }
}

async function collectionForActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return { error: "没有找到当前页面。" };
  const collected = await currentCollector(tab.id);
  if (!collected) return { error: "页面采集器尚未启动。请在加载扩展后刷新收藏页，并从顶部开始滚动。" };
  const rich = await richXhsItems(tab);
  const richItems = rich.items || [];
  const selfAuthors = new Set(rich.selfAuthors || []);
  const filteredCollected = collected.platform === "小红书" ? collected.items.filter((item) => !selfAuthors.has(item.author || "")) : collected.items;
  return { ...collected, items: mergeItems(filteredCollected, richItems), filteredOwn: collected.items.length - filteredCollected.length };
}

async function refreshCount() {
  const result = await collectionForActiveTab();
  if (result.error) return count(result.error);
  count(`${result.platform}：本次已采集 ${result.items.length} 条可整理内容${result.filteredOwn ? `，已排除自己的 ${result.filteredOwn} 条` : ""}`);
}

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "sync:status") {
    status(message.message);
    if (/同步完成|同步失败/.test(message.message)) void refreshCount();
  }
  if (message?.type === "sync:all-status") {
    status(message.message);
    if (/跨平台同步完成|跨平台同步失败/.test(message.message)) void refreshCount();
  }
});

(async () => {
  const saved = await chrome.storage.local.get(["endpoint", "token"]);
  $("endpoint").value = saved.endpoint || $("endpoint").value;
  $("token").value = saved.token || "";
  await refreshCount();
  const allStatus = await chrome.storage.local.get("syncAllStatus");
  if (allStatus.syncAllStatus) status(allStatus.syncAllStatus);
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) {
    const key = `syncStatus:${tab.id}`;
    const previous = await chrome.storage.local.get(key);
    if (previous[key]) status(previous[key]);
  }
})();

$("syncAll").addEventListener("click", async () => {
  const endpoint = $("endpoint").value.replace(/\/$/, "");
  const token = $("token").value.trim();
  await chrome.storage.local.set({ endpoint, token });
  if (!token) return status("请先粘贴本地网页生成的配对码。");
  try {
    await chrome.runtime.sendMessage({ type: "sync:all-start" });
    status("跨平台同步已开始。弹窗关闭后任务仍会继续，重新打开可查看状态。");
  } catch (error) {
    status(error instanceof Error ? error.message : "跨平台同步启动失败，请重试。");
  }
});

$("sync").addEventListener("click", async () => {
  const endpoint = $("endpoint").value.replace(/\/$/, "");
  const token = $("token").value.trim();
  await chrome.storage.local.set({ endpoint, token });
  if (!token) return status("请先粘贴本地网页生成的配对码。");
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return status("没有找到当前页面。");
  try {
    if (tab.url?.includes("zhihu.com")) {
      await chrome.runtime.sendMessage({ type: "sync:zhihu-start", tabId: tab.id, endpoint, token });
      status("知乎收藏夹同步已在后台开始，页面会自动进入各个收藏夹。");
      return;
    }
    const data = await autoCollect(tab.id, status);
    if (data?.error) return status(data.error);
    const rich = await richXhsItems(tab);
    const richItems = rich.items || [];
    const selfAuthors = new Set(rich.selfAuthors || []);
    const filteredCollected = data.platform === "小红书" ? data.items.filter((item) => !selfAuthors.has(item.author || "")) : data.items;
    const items = mergeItems(filteredCollected, richItems);
    if (!items.length) return status("自动采集完成，但没有发现可整理内容。");
    status(`自动采集完成，共 ${items.length} 条，正在导入并自动分类…`);
    const response = await fetch(`${endpoint}/api/extension/import`, { method: "POST", headers: { "content-type": "application/json", "x-collection-token": token }, body: JSON.stringify({ items }) });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "同步失败");
    status(`一键同步完成：新增 ${payload.created.length} 条，更新 ${payload.updated.length} 条，排除 ${payload.skipped || 0} 条${payload.autoOrganized ? "，已自动分类并保留" : ""}。`);
    await refreshCount();
  } catch (error) { status(error instanceof Error ? error.message : "一键同步失败，请重试。"); }
});

$("reset").addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return status("没有找到当前页面。");
  try {
    const result = await chrome.tabs.sendMessage(tab.id, { type: "collection:reset" });
    count(`${result.platform}：本次已采集 ${result.count} 条`);
    status("已重新开始本次采集。请从页面顶部向下滚动。");
  } catch { status("页面采集器尚未启动。请刷新收藏页后重试。"); }
});
