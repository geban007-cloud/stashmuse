// Runs in the extension's isolated world. It records only public card metadata
// that has appeared in the already-open page; no cookies, request headers, or media are read.
(() => {
  const platform = (() => {
    const host = location.hostname;
    if (host.includes("xiaohongshu")) return "小红书";
    if (host.includes("bilibili")) return "B站";
    if (host.includes("zhihu")) return "知乎";
    if (host.includes("weibo")) return "微博";
    return null;
  })();
  if (!platform) return;

  const selectors = {
    "小红书": ["a[href*='/explore/']", "a[href*='/discovery/item/']"],
    "B站": ["a[href*='/video/']", "a[href*='b23.tv']"],
    "知乎": ["a[href*='/question/']", "a[href*='/p/']"],
    // A Weibo card contains author, share, media, and post links. The post URL
    // is selected from this broad set below using its numeric-user/status path.
    "微博": ["a[href*='weibo.com/']"],
  };
  const collected = new Map();
  // Keep legacy cache keys across the product rename so existing collection progress survives.
  const storageKey = `收藏宇宙同步:${platform}`;
  const collectionNameKey = `收藏宇宙同步:${platform}:当前收藏夹`;
  const zhihuRunKey = "收藏宇宙同步:知乎:运行状态";
  const unavailableTitle = /内容不存在|该内容已被删除|笔记不存在|内容不可见|已被删除|已隐藏|已失效|无法查看|暂时无法查看|页面不存在|404/i;

  try {
    const saved = JSON.parse(sessionStorage.getItem(storageKey) || "[]");
    if (Array.isArray(saved)) saved.forEach((item) => item?.sourceKey && collected.set(item.sourceKey, item));
  } catch { /* Ignore stale tab storage. */ }

  function persist() {
    try { sessionStorage.setItem(storageKey, JSON.stringify([...collected.values()])); } catch { /* Ignore storage quota issues. */ }
  }

  function sourceKey(url) {
    const parsed = new URL(url);
    const path = parsed.pathname.replace(/\/$/, "");
    const xhs = path.match(/\/(?:explore|discovery\/item)\/([^/]+)/);
    const bili = path.match(/\/video\/([^/]+)/);
    const zhihu = path.match(/\/(?:question|p)\/([^/]+)/);
    const weibo = path.match(/^\/(\d+)\/([^/]+)/);
    return `${platform}:${xhs?.[1] || bili?.[1] || zhihu?.[1] || (weibo ? `${weibo[1]}/${weibo[2]}` : path)}`;
  }

  function isWeiboPostUrl(value) {
    try {
      const parsed = new URL(value, location.href);
      return parsed.hostname.endsWith("weibo.com") && /^\/\d+\/[^/]+/.test(parsed.pathname);
    } catch { return false; }
  }

  function cardFor(anchor) {
    return anchor.closest("article,li,[class*='note-item'],[class*='feed-item'],[class*='card']") || anchor.parentElement || anchor;
  }

  function scan() {
    const seenCards = new WeakSet();
    document.querySelectorAll(selectors[platform].join(",")).forEach((node) => {
      let anchor = node.closest("a") || node;
      if (!anchor.href) return;
      const urlObject = new URL(anchor.href, location.href);
      if (urlObject.protocol !== "https:") return;
      const card = cardFor(anchor);
      if (platform === "微博") {
        if (seenCards.has(card)) return;
        seenCards.add(card);
        const detailAnchor = [...card.querySelectorAll("a[href]")].find((candidate) => isWeiboPostUrl(candidate.href));
        if (!detailAnchor?.href) return;
        anchor = detailAnchor;
      }
      const canonicalUrl = new URL(anchor.href, location.href);
      if (canonicalUrl.protocol !== "https:") return;
      const url = `${canonicalUrl.origin}${canonicalUrl.pathname}${canonicalUrl.search}`;
      const image = card.querySelector("img");
      const weiboContent = platform === "微博" ? [...card.querySelectorAll("a[href]")].find((candidate) => /video\.weibo\.com|t\.cn\//.test(candidate.href) && (candidate.textContent || "").trim()) : null;
      const title = (weiboContent?.textContent || anchor.textContent || card.querySelector("h1,h2,h3,[class*='title']")?.textContent || "").replace(/\s+/g, " ").trim();
      if (unavailableTitle.test(title)) return;
      const item = {
        platform,
        sourceType: "favorite",
        sourceCollection: sessionStorage.getItem(collectionNameKey) || "",
        sourceKey: sourceKey(url),
        url,
        // Do not turn the collection page's title (often "某某的收藏夹") into a note title.
        // The popup will merge richer 小红书 state data and refuses title-less entries.
        title,
        coverUrl: image?.currentSrc || image?.src || "",
        contentType: platform === "B站" ? "video" : "link",
        excerpt: "",
      };
      collected.set(item.sourceKey, item);
    });
    persist();
  }

  function nextControl() {
    if (platform === "B站") {
      const isUsable = (element) => !(
        element.hasAttribute("disabled") ||
        element.getAttribute("aria-disabled") === "true" ||
        element.classList.contains("disabled") ||
        element.classList.contains("is-disabled") ||
        String(element.className || "").toLowerCase().includes("disabled")
      ) && element.getClientRects().length > 0;
      const labelFor = (element) => `${element.innerText || element.textContent || ""} ${element.getAttribute("aria-label") || ""} ${element.getAttribute("title") || ""}`.replace(/\s+/g, " ").trim();
      const controls = [...document.querySelectorAll("button,a,[role='button']")];

      // B站将“上一页”和“下一页”共用同一个 side class。只接受明确命名为下一页的控件，
      // 不能仅凭 class 推断，避免从第 2 页又点回第 1 页。
      const namedNext = controls.find((element) => isUsable(element) && /下一页|下页|next page/i.test(labelFor(element)));
      if (namedNext) return namedNext;

      return controls.find((element) => isUsable(element) && element.matches(".be-pager-next")) || null;
    }
    const candidates = [...document.querySelectorAll("button,a,[role='button']")];
    return candidates.find((element) => {
      const label = `${element.textContent || ""} ${element.getAttribute("aria-label") || ""} ${element.getAttribute("title") || ""}`.replace(/\s+/g, " ").trim();
      const disabled = element.hasAttribute("disabled") || element.getAttribute("aria-disabled") === "true" || element.classList.contains("disabled") || String(element.className || "").toLowerCase().includes("disabled");
      return !disabled && element.getClientRects().length > 0 && /(?:^|\s)(下一页|下页|下一頁|next|next page)(?:\s|$)/i.test(label);
    }) || null;
  }

  function atBottom() {
    const root = document.scrollingElement || document.documentElement;
    return window.scrollY + window.innerHeight >= root.scrollHeight - Math.max(80, window.innerHeight * 0.12);
  }

  function pageMarker() {
    const labelFor = (element) => `${element.innerText || element.textContent || ""} ${element.getAttribute("aria-label") || ""} ${element.getAttribute("title") || ""}`.replace(/\s+/g, " ").trim();
    const current = [...document.querySelectorAll("button,a,[role='button']")].find((element) => /当前页|current page/i.test(labelFor(element)));
    const active = current || document.querySelector(".be-pager-item-active,.vui_pagenation--btn-active,[aria-current='page']");
    const activeLabel = active ? labelFor(active) : "";
    const match = activeLabel.match(/第\s*(\d+)\s*页|^(\d+)$/);
    const page = match?.[1] || match?.[2];
    return `${location.pathname}${location.search}::${page || activeLabel || "unknown-page"}`;
  }

  async function autoStep() {
    scan();
    if (!atBottom()) {
      window.scrollBy({ top: Math.max(480, Math.round(window.innerHeight * 0.8)), behavior: "smooth" });
      return { platform, count: collected.size, reachedEnd: false, nextAvailable: false, pageMarker: pageMarker() };
    }
    await new Promise((resolve) => window.setTimeout(resolve, 350));
    scan();
    return { platform, count: collected.size, reachedEnd: true, nextAvailable: Boolean(nextControl()), pageMarker: pageMarker() };
  }

  function clickNext() {
    const control = nextControl();
    if (!control) return { clicked: false, platform, count: collected.size };
    control.scrollIntoView({ block: "center" });
    control.click();
    persist();
    return { clicked: true, platform, count: collected.size };
  }

  function zhihuCollections() {
    if (platform !== "知乎") return { isCollection: false, folders: [], currentCollection: "" };
    const folders = new Map();
    document.querySelectorAll("a[href*='/collection/']").forEach((anchor) => {
      const url = new URL(anchor.href, location.href);
      if (!/^\/collection\/\d+\/?$/.test(url.pathname)) return;
      const name = (anchor.innerText || anchor.textContent || "").replace(/\s+/g, " ").trim();
      folders.set(url.href, { url: url.href, name: name || "知乎收藏夹" });
    });
    const isCollection = /^\/collection\/\d+\/?$/.test(location.pathname);
    const currentCollection = (document.querySelector("h1")?.textContent || document.title.replace(/\s*[-|].*$/, "")).replace(/\s+/g, " ").trim();
    return { isCollection, folders: [...folders.values()], currentCollection };
  }

  function setSourceCollection(name) {
    if (name?.trim()) sessionStorage.setItem(collectionNameKey, name.trim());
    else sessionStorage.removeItem(collectionNameKey);
    return { platform, sourceCollection: sessionStorage.getItem(collectionNameKey) || "" };
  }

  function readZhihuRun() {
    try { return JSON.parse(sessionStorage.getItem(zhihuRunKey) || "null"); } catch { return null; }
  }

  function saveZhihuRun(state) {
    sessionStorage.setItem(zhihuRunKey, JSON.stringify(state));
  }

  function extractDetail() {
    const bodyText = (document.body?.innerText || "").replace(/\n{3,}/g, "\n\n").trim();
    const selectorsByPlatform = {
      "小红书": ["#detail-desc", ".note-content", ".desc", "[class*='note-content']", "[class*='note-scroller']"],
      "知乎": ["article", ".Post-RichTextContainer", ".RichText", "[class*='RichText']"],
      "B站": [".video-desc", ".desc-info", "[class*='video-desc']"],
      "微博": ["article", "[node-type='feed_list_content']", "[class*='detail_wbtext']"],
    };
    let detail = "";
    for (const selector of selectorsByPlatform[platform] || []) {
      const node = document.querySelector(selector);
      const value = node?.innerText?.replace(/\s+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
      if (value && value.length > detail.length) detail = value;
    }
    if (!detail && platform === "B站") detail = document.querySelector("meta[name='description']")?.content || "";
    const title = document.querySelector("h1")?.textContent?.replace(/\s+/g, " ").trim() || document.title.replace(/[-|｜].*$/, "").trim();
    const hasVideo = Boolean(document.querySelector("video")) || platform === "B站";
    const subtitleText = [...document.querySelectorAll("[class*='subtitle'],[class*='caption'],[class*='danmaku']")].map((node) => node.textContent || "").join(" ").replace(/\s+/g, " ").trim();
    const rawText = detail || bodyText;
    const isCollectionShell = /收藏夹|收藏列表|推荐|发现|通知|登录探索更多内容/.test(rawText) && rawText.length > 10000;
    if (isCollectionShell && detail.length < 40) return { status: "failed", error: "当前仍是收藏列表页，没有进入详情页。", sourceUrl: location.href, method: "" };
    if (hasVideo && platform === "B站" && !subtitleText && detail.length < 80) return { status: "pending", error: "视频页面没有公开字幕，需要下载音频后转录。", sourceUrl: location.href, title, rawText: detail, method: "页面简介" };
    return { status: rawText.length >= 40 ? "ready" : "failed", rawText, cleanedText: rawText, transcript: subtitleText, sourceUrl: location.href, title, method: subtitleText ? "页面字幕" : hasVideo ? "视频简介" : "正文提取" };
  }

  function showZhihuStatus(message) {
    if (platform !== "知乎") return;
    let notice = document.getElementById("collection-universe-sync-status");
    if (!notice) {
      notice = document.createElement("div");
      notice.id = "collection-universe-sync-status";
      notice.style.cssText = "position:fixed;right:20px;bottom:20px;z-index:2147483647;max-width:300px;padding:10px 12px;border-radius:7px;background:#1f3a32;color:#fff;font:13px -apple-system,BlinkMacSystemFont,'PingFang SC',sans-serif;line-height:1.45;box-shadow:0 4px 16px rgba(0,0,0,.2)";
      document.documentElement.append(notice);
    }
    notice.textContent = `「不怕吃灰」收藏夹：${message}`;
  }

  function reportZhihuProgress(message) {
    showZhihuStatus(message);
    chrome.runtime.sendMessage({ type: "collection:zhihu-progress", tabId: null, message }).catch(() => undefined);
  }

  function activeZhihuFolder(state) {
    return state.folders?.[state.index] || null;
  }

  function finishZhihuFolder() {
    const state = readZhihuRun();
    if (!state) return;
    state.index += 1;
    const nextFolder = activeZhihuFolder(state);
    if (!nextFolder) {
      sessionStorage.removeItem(zhihuRunKey);
      persist();
      reportZhihuProgress(`采集完成，共 ${collected.size} 条，正在导入并自动分类…`);
      chrome.runtime.sendMessage({ type: "collection:zhihu-finished", tabId: null, items: [...collected.values()] }).catch(() => undefined);
      return;
    }
    state.mode = "navigating";
    state.visitedPages = [];
    state.emptyChecks = 0;
    saveZhihuRun(state);
    reportZhihuProgress(`正在进入知乎收藏夹 ${state.index + 1}/${state.folders.length}：${nextFolder.name}…`);
    location.assign(nextFolder.url);
  }

  let zhihuTimer;
  let zhihuRunning = false;
  function scheduleZhihuRun(delay = 650) {
    window.clearTimeout(zhihuTimer);
    zhihuTimer = window.setTimeout(runZhihuFolder, delay);
  }

  async function runZhihuFolder() {
    if (platform !== "知乎" || zhihuRunning) return;
    const state = readZhihuRun();
    if (!state || state.mode !== "collecting") return;
    zhihuRunning = true;
    try {
      const folder = activeZhihuFolder(state);
      if (!folder) return finishZhihuFolder();
      scan();
      const label = `正在采集「${folder.name}」：已发现 ${collected.size} 条`;
      if (!atBottom()) {
        reportZhihuProgress(label);
        window.scrollBy({ top: Math.max(480, Math.round(window.innerHeight * 0.8)), behavior: "smooth" });
        scheduleZhihuRun();
        return;
      }
      await new Promise((resolve) => window.setTimeout(resolve, 400));
      scan();
      const noCardsYet = !document.querySelector(selectors[platform].join(","));
      if (noCardsYet && (state.emptyChecks || 0) < 5) {
        state.emptyChecks = (state.emptyChecks || 0) + 1;
        saveZhihuRun(state);
        reportZhihuProgress(`正在等待「${folder.name}」内容加载…`);
        scheduleZhihuRun(1000);
        return;
      }
      const marker = pageMarker();
      const visitedPages = new Set(state.visitedPages || []);
      if (visitedPages.has(marker)) return finishZhihuFolder();
      visitedPages.add(marker);
      state.visitedPages = [...visitedPages];
      saveZhihuRun(state);
      const next = nextControl();
      if (!next) return finishZhihuFolder();
      reportZhihuProgress(`正在进入「${folder.name}」下一页…`);
      next.scrollIntoView({ block: "center" });
      next.click();
      scheduleZhihuRun(1200);
    } finally {
      zhihuRunning = false;
    }
  }

  function resumeZhihuRun() {
    const state = readZhihuRun();
    if (!state) return;
    const folder = activeZhihuFolder(state);
    if (!folder) return finishZhihuFolder();
    const target = new URL(folder.url);
    if (target.pathname !== location.pathname) {
      location.assign(folder.url);
      return;
    }
    state.mode = "collecting";
    state.visitedPages ||= [];
    state.emptyChecks ||= 0;
    saveZhihuRun(state);
    setSourceCollection(folder.name);
    reportZhihuProgress(`正在采集「${folder.name}」…`);
    scheduleZhihuRun(800);
  }

  function startZhihuRun() {
    const context = zhihuCollections();
    const folders = context.isCollection || !(context.folders || []).length
      ? [{ url: location.href, name: context.currentCollection || "知乎收藏夹" }]
      : context.folders;
    collected.clear();
    sessionStorage.removeItem(storageKey);
    sessionStorage.removeItem(collectionNameKey);
    saveZhihuRun({ folders, index: 0, mode: "navigating", visitedPages: [], emptyChecks: 0 });
    reportZhihuProgress(`已找到 ${folders.length} 个知乎收藏夹，准备开始…`);
    resumeZhihuRun();
  }

  let timer;
  const scheduleScan = () => { window.clearTimeout(timer); timer = window.setTimeout(scan, 250); };
  scan();
  if (platform === "知乎" && readZhihuRun()) resumeZhihuRun();
  window.addEventListener("scroll", scheduleScan, { passive: true });
  new MutationObserver(scheduleScan).observe(document.documentElement, { childList: true, subtree: true });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "collection:get") { scan(); sendResponse({ platform, items: [...collected.values()] }); }
    if (message?.type === "collection:reset") { collected.clear(); sessionStorage.removeItem(storageKey); sessionStorage.removeItem(collectionNameKey); sessionStorage.removeItem(zhihuRunKey); scan(); sendResponse({ platform, count: collected.size }); }
    if (message?.type === "collection:auto-step") { void autoStep().then(sendResponse); return true; }
    if (message?.type === "collection:auto-next") { sendResponse(clickNext()); }
    if (message?.type === "collection:zhihu-collections") { sendResponse(zhihuCollections()); }
    if (message?.type === "collection:set-source-collection") { sendResponse(setSourceCollection(message.name)); }
    if (message?.type === "collection:navigate") { sendResponse({ navigating: true }); location.assign(message.url); }
    if (message?.type === "collection:zhihu-start") { startZhihuRun(); sendResponse({ started: true }); }
    if (message?.type === "collection:zhihu-status") { showZhihuStatus(message.message); sendResponse({ shown: true }); }
    if (message?.type === "content:extract-detail") { sendResponse(extractDetail()); }
  });
})();
