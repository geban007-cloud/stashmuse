"use client";

import { type CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import { Bell, Check, ExternalLink, RefreshCw, X } from "lucide-react";
import { GalleryDialog, InsightPanel } from "./panels";
import { searchCollections } from "@/lib/collection-search";
import { themes, learningGroups, learningChildren, directoryScope, type UniverseKey, type UniverseTheme } from "@/lib/gallery-themes";

type Category = { id: string; name: string; parentId: string | null };
type SavedItem = {
  id: string;
  platform: string;
  title: string;
  url: string;
  author: string | null;
  excerpt: string | null;
  status: string;
  categoryId: string | null;
  coverUrl?: string | null;
  contentType?: string;
  tags?: string;
};
type DigestCard = SavedItem & { sourceCollection?: string | null };
type ActionPlan = { id: string; itemId: string; title: string; steps: { title: string; detail: string; minutes: number }[]; status: string };

type GalleryChild = { label: string; id: string | null; group?: "self" | "parenting" };

// Coordinates are percentages of each square illustration, not viewport pixels.
// Keeping art and branches in one canvas anchors the dots at every screen size.
const artAnchors: Record<UniverseKey, [number, number][]> = {
  beauty: [[60, 22], [73, 48], [57, 66], [64, 85]],
  lifestyle: [[50, 20], [60, 42], [40, 68], [60, 80]],
  health: [[76, 8], [67, 35], [66, 61], [63, 88]],
  // Spread evenly over the receipt, display, laptop edge and account notebook.
  ai: [[72, 26], [44, 44], [60, 62], [73, 80]],
  growth: [[72, 22], [53, 38], [78, 54], [64, 70], [47, 86]],
  travel: [[55, 18], [70, 43], [55, 59], [65, 86]],
  other: [[64, 35], [62, 65]],
};

function ThemeScene({ theme, children, onOpen, action }: {
  theme: UniverseTheme;
  children: GalleryChild[];
  onOpen: (child: GalleryChild) => void;
  action?: { label: string; onOpen: () => void; disabled: boolean };
}) {
  const [ready, setReady] = useState(false);
  const artwork = useRef<HTMLImageElement>(null);
  useEffect(() => {
    // A cached image can finish before React attaches its load listener.
    if (artwork.current?.complete && artwork.current.naturalWidth) setReady(true);
  }, []);
  return <section className={`gallery-stage${ready ? " is-ready" : ""}`} aria-label={`${theme.label} 收藏展厅`}>
    <div className={`gallery-art gallery-art-${theme.key}`}>
      <img ref={artwork} src={theme.asset} alt={`${theme.label}主题插画`} onLoad={() => setReady(true)} onError={() => setReady(true)} />
    </div>
    <div className="gallery-branches" key={children.map((child) => child.id || child.label).join("|")}>
      {children.map((child, index) => {
        const [x, y] = artAnchors[theme.key][index] ?? [50, 43 + index * 44 / Math.max(1, children.length - 1)];
        return <button className="gallery-branch" key={child.id || child.label} onClick={() => onOpen(child)} style={{
          "--anchor-x": `${x * .64}%`, "--anchor-y": `${y}%`,
          "--branch-right": `${[8, 2, 11, 4][index % 4]}%`, "--branch-delay": `${340 + index * 150}ms`,
        } as CSSProperties}>
          <span className="branch-dot" aria-hidden="true" />
          <span className="branch-line" aria-hidden="true" />
          <span className="branch-label">{child.label}</span>
        </button>;
      })}
    </div>
    {action && <div className="scene-caption">
      <button className="scene-caption-action" disabled={action.disabled} onClick={action.onOpen}>
        <svg className="scene-action-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          {theme.key === "beauty"
            ? <><path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z" /><path d="M20 2v4m-2-2h4" /></>
            : <><path d="M12 6v15M3 4c4-1 7 0 9 2 2-2 5-3 9-2v15c-4-1-7 0-9 2-2-2-5-3-9-2Z" /><path d="m6 8 3 1m6 0 3-1" /></>}
        </svg>
        <span>{action.label}</span>
        <svg className="scene-action-arrow" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 12h16m-6-6 6 6-6 6" /></svg>
      </button>
    </div>}
  </section>;
}

function readableExcerpt(item: SavedItem) {
  const text = item.excerpt?.trim() || "这条收藏暂时没有文字摘要，打开原链接查看完整内容。";
  return text.length > 76 ? `${text.slice(0, 76)}…` : text;
}

export default function GalleryPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<SavedItem[]>([]);
  const [activeKey, setActiveKey] = useState<UniverseKey>("beauty");
  const [activeChild, setActiveChild] = useState<GalleryChild | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [insightOpen, setInsightOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  const [bellOpen, setBellOpen] = useState(false);
  const [digest, setDigest] = useState<{ id: string; items: DigestCard[]; byItem: Record<string, { action: string }> }>({ id: "", items: [], byItem: {} });
  const [plans, setPlans] = useState<Record<string, ActionPlan>>({});
  const [bellMessage, setBellMessage] = useState("");
  const [regenerating, setRegenerating] = useState(false);
  const pendingDigestCount = useMemo(
    () => digest.items.filter((item) => !digest.byItem[item.id]).length,
    [digest.items, digest.byItem],
  );

  const applyDigest = async (digestData: { digest: { id: string } | null; items: DigestCard[]; retention: { byItem: Record<string, { action: string }> }; actionPlans: ActionPlan[] }) => {
    setDigest({ id: digestData.digest?.id || "", items: digestData.items, byItem: digestData.retention.byItem });
    setPlans(Object.fromEntries(digestData.actionPlans.map((plan) => [plan.itemId, plan])));
    if (!digestData.digest?.id || !digestData.items.length) return;
    try {
      const response = await fetch("/api/digest/enrich", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ digestId: digestData.digest.id, itemIds: digestData.items.map((item) => item.id) }) });
      if (!response.ok) return;
      const enriched = await response.json() as { items: DigestCard[] };
      setDigest((current) => ({ ...current, items: enriched.items }));
    } catch { /* Keep the cards usable even when a source cannot be read. */ }
  };

  useEffect(() => {
    void Promise.all([fetch("/api/categories"), fetch("/api/items?status=all"), fetch("/api/digest/today")])
      .then(async ([categoryResponse, itemResponse, digestResponse]) => {
        if (!categoryResponse.ok || !itemResponse.ok || !digestResponse.ok) throw new Error("本地收藏库暂不可用");
        const categoryData = (await categoryResponse.json()) as { categories: Category[] };
        const itemData = (await itemResponse.json()) as { items: SavedItem[] };
        const digestData = await digestResponse.json() as { digest: { id: string } | null; items: DigestCard[]; retention: { byItem: Record<string, { action: string }> }; actionPlans: ActionPlan[] };
        setCategories(categoryData.categories);
        setItems(itemData.items.filter((item) => item.status !== "trash"));
        void applyDigest(digestData);
      })
      .catch(() => { setLoadError("本地收藏库暂不可用，请检查服务后重试。"); })
      .finally(() => setLoading(false));
  }, [reload]);

  const regenerateDigest = async () => {
    setRegenerating(true); setBellMessage("正在换一批，并尝试补齐摘要…");
    try {
      const response = await fetch("/api/digest/today?refresh=1", { method: "POST" });
      if (!response.ok) throw new Error("换一批失败");
      await applyDigest(await response.json() as { digest: { id: string } | null; items: DigestCard[]; retention: { byItem: Record<string, { action: string }> }; actionPlans: ActionPlan[] });
      setBellMessage("已换一批新的灵感回访。");
    } catch (error) { setBellMessage(error instanceof Error ? error.message : "换一批失败，请稍后重试。"); }
    finally { setRegenerating(false); }
  };

  const recordDigest = async (itemId: string, action: "read" | "applied" | "not_interested") => {
    if (!digest.id) return;
    const response = await fetch("/api/retention", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ digestId: digest.id, itemId, action }) });
    if (!response.ok) return;
    setDigest((current) => ({ ...current, byItem: { ...current.byItem, [itemId]: { action } } }));
    setBellMessage(action === "read" ? "已记录为已看。" : action === "applied" ? "已记录为下步行动。" : "已从今日回访中丢弃。");
  };
  const makeAction = async (item: DigestCard) => {
    const response = await fetch("/api/action-plans", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ itemId: item.id, digestId: digest.id }) });
    if (!response.ok) return;
    const data = await response.json() as { plan: ActionPlan };
    setPlans((current) => ({ ...current, [item.id]: data.plan }));
    await recordDigest(item.id, "applied");
    setBellMessage("已生成一条马上可以开始的最小行动。");
  };
  const toggleActionDone = async (plan: ActionPlan) => {
    const nextStatus = plan.status === "done" ? "open" : "done";
    const response = await fetch("/api/action-plans", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: plan.id, status: nextStatus }) });
    if (!response.ok) return;
    setPlans((current) => ({ ...current, [plan.itemId]: { ...plan, status: nextStatus } }));
    setBellMessage(nextStatus === "done" ? "已记录为完成行动。" : "已重新打开这条行动。");
  };

  const keptItems = useMemo(() => items.filter((item) => item.status === "kept"), [items]);
  const categoryPaths = useMemo(() => new Map(categories.map((category) => {
    const path = [category.name];
    let root = category;
    const seen = new Set([root.id]);
    while (root.parentId) {
      const parent = categories.find((candidate) => candidate.id === root.parentId);
      if (!parent || seen.has(parent.id)) break;
      seen.add(parent.id); path.unshift(parent.name); root = parent;
    }
    const theme = themes.find((candidate) => candidate.matcher.test(root.name));
    if (theme && path[0] !== theme.label) path.unshift(theme.label);
    return [category.id, path.join(" / ")];
  })), [categories]);
  const searchResults = useMemo(() => searchCollections(items, query, categoryPaths), [query, items, categoryPaths]);

  const activeTheme = themes.find((theme) => theme.key === activeKey) ?? themes[0];
  const activePrimary = useMemo(
    () => categories.find((category) => !category.parentId && activeTheme.matcher.test(category.name)) ?? null,
    [activeTheme, categories],
  );
  const themeItems = useMemo(() => {
    // Include all matching root directories and their descendants, even when
    // more than four children exist and only four are shown around the artwork.
    const directoryIds = directoryScope(categories, activeTheme.matcher);
    if (!directoryIds.size) return keptItems.filter((item) => activeTheme.matcher.test(`${item.title} ${item.excerpt || ""}`));
    return keptItems.filter((item) => item.categoryId && directoryIds.has(item.categoryId));
  }, [activeTheme, categories, keptItems]);
  const childCategories = useMemo<GalleryChild[]>(() => {
    if (activeTheme.key === "growth") return learningChildren(categories);
    if (!activePrimary) return activeTheme.fallbackChildren.map((label) => ({ label, id: null }));
    const children = categories.filter((category) => category.parentId === activePrimary.id);
    if (activeTheme.key === "other") {
      return activeTheme.fallbackChildren.map((label) => ({
        label, id: children.find((category) => category.name === label)?.id ?? null,
      }));
    }
    if (activeTheme.key === "beauty") {
      const aliases: Record<string, string[]> = {
        发型参考: ["发型参考", "发型搭配"],
        美妆护肤: ["美妆护肤", "护肤功课"],
        穿搭参考: ["穿搭参考", "服装搭配"],
        美甲参考: ["美甲参考", "美甲"],
      };
      return activeTheme.fallbackChildren.map((label) => {
        const category = children.find((child) => aliases[label].includes(child.name));
        // Older libraries keep outfit notes directly in the 穿搭参考 root.
        const legacyOutfits = label === "穿搭参考" && activePrimary.name === "穿搭参考";
        return { label, id: category?.id ?? (legacyOutfits ? activePrimary.id : null) };
      });
    }
    return children.length ? children.map((category) => ({ label: category.name, id: category.id })) : activeTheme.fallbackChildren.map((label) => ({ label, id: null }));
  }, [activePrimary, activeTheme, categories]);
  const shownChildren = activeTheme.key === "growth" ? childCategories : childCategories.slice(0, 4);
  const modalItems = useMemo(() => {
    if (!activeChild) return [];
    if (activeChild.group) {
      const group = learningGroups.find((candidate) => candidate.key === activeChild.group)!;
      const ids = directoryScope(categories, group.matcher);
      return keptItems.filter((item) => item.categoryId && ids.has(item.categoryId));
    }
    if (activeChild.id) return keptItems.filter((item) => item.categoryId === activeChild.id);
    // A new visual entrance without a matching directory must stay empty.
    if (activeTheme.key === "beauty" || activeTheme.key === "other") return [];
    if (activePrimary) return keptItems.filter((item) => item.categoryId === activePrimary.id);
    return keptItems.filter((item) => activeTheme.matcher.test(item.title) || activeTheme.matcher.test(item.excerpt || ""));
  }, [activeChild, activePrimary, activeTheme, keptItems, categories]);

  const switchTheme = (key: UniverseKey) => {
    setActiveKey(key);
    setActiveChild(null);
    setInsightOpen(false);
    setSelected([]);
  };
  const openChild = (child: GalleryChild) => {
    setActiveChild(child);
    setSelected([]);
  };
  const toggleAll = () => {
    if (selected.length === modalItems.length) setSelected([]);
    else setSelected(modalItems.map((item) => item.id));
  };

  return (
    <main className={`gallery-shell theme-${activeTheme.key}`}>
      <header className="gallery-nav">
        <Link className="gallery-mark" href="/" prefetch={false} onClick={(event) => { event.preventDefault(); window.location.assign("/"); }}>「不怕吃灰」收藏夹</Link>
        <nav aria-label="一级分类">
          {themes.map((theme) => (
            <button key={theme.key} className={theme.key === activeKey ? "gallery-nav-item is-active" : "gallery-nav-item"} onClick={() => switchTheme(theme.key)}>
              {theme.label}
            </button>
          ))}
        </nav>
        <button className="gallery-bell" aria-label="打开今日灵感回访" aria-expanded={bellOpen} onClick={() => setBellOpen((open) => !open)}>
          <Bell size={18} strokeWidth={1.6} />
          {pendingDigestCount > 0 && <span className="gallery-bell-count">{pendingDigestCount}</span>}
        </button>
        <form className="gallery-search" role="search" onSubmit={(event) => { event.preventDefault(); setSearchOpen(true); }}>
          <input aria-label="搜索全部收藏" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索收藏…" maxLength={200} />
          {query && <button type="button" className="search-clear" onClick={() => setQuery("")} aria-label="清空搜索">×</button>}
          <button type="submit" disabled={loading || !!loadError} aria-label="搜索"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></svg></button>
        </form>
        <Link className="gallery-return" href="/" prefetch={false} aria-label="返回管理后台" onClick={(event) => { event.preventDefault(); window.location.assign("/"); }}>管理后台</Link>
      </header>
      {bellOpen && <aside className="gallery-notification-panel" aria-label="今日灵感回访">
        <div className="gallery-notification-head"><div><span className="modal-kicker">DAILY INSPIRATION</span><h2>今日灵感回访</h2></div><div className="gallery-notification-head-actions"><button className="gallery-notification-refresh" aria-label="换一批灵感回访" disabled={regenerating} onClick={() => void regenerateDigest()}><RefreshCw size={15} className={regenerating ? "is-spinning" : undefined} /><span>{regenerating ? "生成中" : "换一批"}</span></button><button aria-label="关闭今日灵感回访" onClick={() => setBellOpen(false)}><X size={18} /></button></div></div>
        {bellMessage && <p className="gallery-notification-message" role="status">{bellMessage}</p>}
        {digest.items.length ? <div className="gallery-notification-list">{digest.items.map((item) => { const feedback = digest.byItem[item.id]; const plan = plans[item.id]; return <article className="gallery-notification-card" key={item.id}>
          <div className="gallery-notification-meta"><span>{item.platform}</span>{feedback && <em><Check size={12} /> {feedback.action === "not_interested" ? "已丢弃" : feedback.action === "applied" ? "已行动" : "已看"}</em>}</div>
          <a href={item.url} target="_blank" rel="noreferrer">{item.title}<ExternalLink size={13} /></a>
          <p>{readableExcerpt(item)}</p>
          <small>来源：{item.sourceCollection || item.platform}{item.author ? ` · ${item.author}` : ""}</small>
          <div className="gallery-notification-actions"><button onClick={() => void recordDigest(item.id, "read")}>已看</button><button onClick={() => void recordDigest(item.id, "not_interested")}>丢弃</button><button onClick={() => void makeAction(item)}>下步行动</button></div>
          {plan && <div className="gallery-todo"><strong>{plan.steps[0]?.title || plan.title}</strong><p>{plan.steps[0]?.detail}</p><button onClick={() => void toggleActionDone(plan)}>{plan.status === "done" ? "已完成 · 撤销" : "标记已完成"}</button></div>}
        </article>; })}</div> : <div className="gallery-empty">今天还没有可回访的非变美内容。</div>}
      </aside>}
      {loading && <p className="gallery-data-status" role="status">正在读取本地收藏…</p>}
      {loadError && <p className="gallery-data-status gallery-error" role="alert">{loadError} <button onClick={() => { setLoading(true); setLoadError(""); setReload((value) => value + 1); }}>重试</button></p>}

      <ThemeScene key={activeTheme.key} theme={activeTheme} onOpen={openChild} action={activeKey === "beauty" ? { label: "私人搭配助手", onOpen: () => setInsightOpen(true), disabled: loading || !!loadError } : undefined}>{shownChildren}</ThemeScene>

      {insightOpen && activeKey === "beauty" && <GalleryDialog title="私人搭配助手" kicker={activeTheme.label} onClose={() => setInsightOpen(false)}><InsightPanel key="beauty" mode="assistant" items={keptItems} scopeItems={themeItems} /></GalleryDialog>}

      {searchOpen && <GalleryDialog title="搜索收藏" kicker="跨平台 · 跨分类" onClose={() => setSearchOpen(false)}>
        <div className="modal-content">
          <input className="search-modal-input" aria-label="搜索关键词" autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="试试桌搭布置、上班穿搭、读书推荐…" maxLength={200} />
          <p className="search-count" aria-live="polite">{query.trim() ? `找到 ${searchResults.length} 条收藏 · 按相关度排序` : "输入想找的内容，无需手动分词"}<br />支持中文拆词与常见近义词 · 包含待整理、已保留、稍后决定，不含回收站</p>
          {searchResults.length ? <div className="collection-grid">{searchResults.map(({ item, matchedTerms, exact }) => <article className="collection-card search-card" key={item.id}><span className="card-platform">{item.platform} · {{ inbox: "待整理", kept: "已保留", later: "稍后决定" }[item.status] || item.status}</span><a href={/^https?:\/\//i.test(item.url) ? item.url : "#"} target="_blank" rel="noreferrer">{item.title}</a><p>{readableExcerpt(item)}</p><small>{categoryPaths.get(item.categoryId || "") || "未分类"} · {item.author || "未标注作者"}</small><small className="search-match">{exact ? "原词匹配" : "拆词 / 近义匹配"} · {matchedTerms.join("、")}</small></article>)}</div> : <div className="gallery-empty">{query.trim() ? "暂未找到相关收藏。可以换一种表达；目前只能检索已采集的文字，尚未读取图片或视频中的内容。" : "可搜索标题、已采集正文片段、作者、平台、分类和标签。"}</div>}
        </div>
      </GalleryDialog>}

      {activeChild && (
        <GalleryDialog title={activeChild.label} kicker={activeTheme.label} onClose={() => setActiveChild(null)}>
            <div className="collection-view-title">全部收藏 <span>{modalItems.length}</span></div>
              <div className="modal-content">
                <div className="collection-tools"><button onClick={toggleAll}>{selected.length === modalItems.length && modalItems.length ? "取消全选" : "全选"}</button><span>已选择 {selected.length} 条</span></div>
                {modalItems.length ? <div className="collection-grid">{modalItems.map((item) => <article className={selected.includes(item.id) ? "collection-card is-selected" : "collection-card"} key={item.id}><button className="select-card" aria-label={`选择 ${item.title}`} onClick={() => setSelected((current) => current.includes(item.id) ? current.filter((id) => id !== item.id) : [...current, item.id])} /><span className="card-platform">{item.platform}</span><a href={item.url} target="_blank" rel="noreferrer">{item.title}</a><p>{readableExcerpt(item)}</p><small>{item.author || "未标注作者"}</small></article>)}</div> : <div className="gallery-empty">这个分类还没有已保留的收藏。你可以在管理后台调整目录归属。</div>}
              </div>
        </GalleryDialog>
      )}
    </main>
  );
}
import Link from "next/link";
