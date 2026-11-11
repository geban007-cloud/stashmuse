"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AdminDelivery } from "@/components/admin-delivery";
import {
  ArrowUpRight,
  Download,
  FolderTree,
  Link2,
  Plus,
  Search,
  Sparkles,
  Trash2,
  Upload,
  WandSparkles,
  X,
} from "lucide-react";

type Category = { id: string; name: string; parentId: string | null };
type SavedItem = { id: string; platform: string; sourceType: string; title: string; url: string; author: string | null; excerpt: string | null; status: string; categoryId: string | null; categorySource?: string; availability: string };
type Suggestion = { categoryId: string | null; tags: string; confidence: number };
type ActionStats = { total: number; completed: number; open: number };
const statuses = [["inbox", "待整理"], ["kept", "已保留"], ["later", "稍后决定"], ["trash", "回收站"]] as const;

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { "content-type": "application/json", ...init?.headers } });
  const payload = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(payload.error || "操作失败");
  return payload as T;
}

export default function Home() {
  const [items, setItems] = useState<SavedItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [status, setStatus] = useState("inbox");
  const [message, setMessage] = useState("正在连接本地收藏库…");
  const [query, setQuery] = useState("");
  const [actionStats, setActionStats] = useState<ActionStats>({ total: 0, completed: 0, open: 0 });
  const [pairToken, setPairToken] = useState("");
  const [suggestionByItem, setSuggestionByItem] = useState<Record<string, Suggestion>>({});
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [directoryOpen, setDirectoryOpen] = useState(false);
  const [organizing, setOrganizing] = useState(false);
  const [syncingAll, setSyncingAll] = useState(false);
  const backupInput = useRef<HTMLInputElement>(null);
  const syncStartTimeout = useRef<number | null>(null);
  const [form, setForm] = useState({ platform: "小红书", title: "", url: "", author: "", excerpt: "", sourceType: "favorite" });

  const load = async () => {
    try {
      const [itemData, categoryData, actionStatsData] = await Promise.all([
        request<{ items: SavedItem[] }>(`/api/items?status=${status}&q=${encodeURIComponent(query)}`),
        request<{ categories: Category[] }>("/api/categories"),
        request<{ stats: ActionStats }>("/api/action-plans"),
      ]);
      setItems(itemData.items); setCategories(categoryData.categories); setActionStats(actionStatsData.stats); setMessage("本地收藏库已连接");
    } catch (error) { setMessage(error instanceof Error ? error.message : "本地数据库尚未初始化"); }
  };
  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
    // `load` intentionally follows the selected inbox state; mutations call it explicitly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);
  useEffect(() => {
    const receiveSyncStatus = (event: MessageEvent) => {
      if (event.source !== window || event.origin !== window.location.origin || event.data?.source !== "collector-universe-backend") return;
      if (syncStartTimeout.current != null) { window.clearTimeout(syncStartTimeout.current); syncStartTimeout.current = null; }
      if (event.data.type === "sync-all-started") setMessage("跨平台同步已开始：扩展会依次处理已打开的收藏页。");
      if (event.data.type === "sync-all-status") {
        setMessage(event.data.message);
        if (/跨平台同步完成|跨平台同步失败/.test(event.data.message)) { setSyncingAll(false); void load(); }
      }
      if (event.data.type === "sync-all-error") { setSyncingAll(false); setMessage(`无法连接同步扩展：${event.data.message}。请在 Chrome 扩展管理页刷新“「不怕吃灰」收藏夹”后重试。`); }
    };
    window.addEventListener("message", receiveSyncStatus);
    return () => { window.removeEventListener("message", receiveSyncStatus); if (syncStartTimeout.current != null) window.clearTimeout(syncStartTimeout.current); };
    // The bridge only needs the stable load callback after a completed sync.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!directoryOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDirectoryOpen(false);
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [directoryOpen]);
  const patchItem = async (id: string, patch: Record<string, unknown>) => { await request("/api/items", { method: "PATCH", body: JSON.stringify({ id, ...patch }) }); await load(); };
  const patchSelected = async (nextStatus: string) => { await Promise.all(selectedIds.map((id) => request("/api/items", { method: "PATCH", body: JSON.stringify({ id, status: nextStatus }) }))); setSelectedIds([]); await load(); };
  const addCategory = async (parentId: string | null = null) => { const name = window.prompt(parentId ? "二级分类名称" : "一级分类名称"); if (!name?.trim()) return; await request("/api/categories", { method: "POST", body: JSON.stringify({ name, parentId }) }); await load(); };
  const addItem = async (event: React.FormEvent) => { event.preventDefault(); await request("/api/items", { method: "POST", body: JSON.stringify(form) }); setForm({ platform: "小红书", title: "", url: "", author: "", excerpt: "", sourceType: "favorite" }); setFormOpen(false); setStatus("inbox"); await load(); };
  const pairExtension = async () => { const result = await request<{ token: string }>("/api/extension/pair", { method: "POST" }); setPairToken(result.token); setMessage("配对码已生成，请粘贴到 Chrome 扩展中。"); };
  const syncAllPlatforms = async () => {
    setSyncingAll(true);
    try {
      const result = await request<{ token: string }>("/api/extension/pair", { method: "POST" });
      setPairToken(result.token);
      setMessage("正在唤起浏览器扩展并检查已打开的收藏页…");
      window.postMessage({ source: "collector-universe-backend", type: "sync-all", endpoint: window.location.origin, token: result.token }, window.location.origin);
      syncStartTimeout.current = window.setTimeout(() => {
        setSyncingAll(false);
        setMessage("尚未连接同步扩展。请在 Chrome 扩展管理页刷新“「不怕吃灰」收藏夹”，再刷新本后台页面后重试。");
      }, 5000);
    } catch (error) {
      setSyncingAll(false);
      setMessage(error instanceof Error ? error.message : "跨平台同步启动失败，请重试。");
    }
  };
  const exportBackup = async () => { const response = await fetch("/api/backup"); const blob = new Blob([await response.text()], { type: "application/json" }); const href = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = href; anchor.download = "「不怕吃灰」收藏夹-备份.json"; anchor.click(); URL.revokeObjectURL(href); };
  const importBackup = async (event: React.ChangeEvent<HTMLInputElement>) => { const file = event.target.files?.[0]; if (!file) return; try { const backup = JSON.parse(await file.text()); const replace = window.confirm("确定要用该备份完整恢复吗？\n确认：完全替换当前收藏数据；取消：仅合并不重复内容。"); const result = await request<{ imported: { savedItems: number } }>("/api/backup/import", { method: "POST", body: JSON.stringify({ backup, mode: replace ? "replace" : "merge" }) }); setMessage(`已导入 ${result.imported.savedItems} 条收藏。`); await load(); } catch (error) { setMessage(error instanceof Error ? error.message : "备份文件无法读取"); } finally { event.target.value = ""; } };
  const emptyTrash = async () => { if (!window.confirm("确定永久清空回收站？此操作无法撤销。")) return; const result = await request<{ deleted: number }>("/api/trash", { method: "DELETE" }); setMessage(`已永久删除回收站内 ${result.deleted} 条内容。`); await load(); };
  const suggest = async (itemId: string) => { try { const result = await request<{ suggestion: Suggestion }>("/api/suggestions", { method: "POST", body: JSON.stringify({ itemId }) }); setSuggestionByItem({ ...suggestionByItem, [itemId]: result.suggestion }); setMessage("已生成新的 AI 分类建议；批量整理结果已经直接写入收藏库。"); } catch (error) { setMessage(error instanceof Error ? error.message : "AI 建议暂时不可用"); } };
  const organizeFirstImport = async () => { if (!window.confirm("AI 会自动生成一级/二级分类，并把全部有效收藏直接归入分类并标记为已保留，不需要逐条确认。现在开始吗？")) return; setOrganizing(true); setMessage("DeepSeek 正在生成层级目录并批量归类，请保持本地页面打开…"); try { const result = await request<{ createdCategories: string[]; classified: number; total: number }>("/api/onboarding/organize", { method: "POST" }); setMessage(`AI 自动整理完成：新增 ${result.createdCategories.length} 个目录，已归类并保留 ${result.classified}/${result.total} 条。`); await load(); } catch (error) { setMessage(error instanceof Error ? error.message : "AI 自动整理暂时不可用"); } finally { setOrganizing(false); } };

  const rootCategories = categories.filter((category) => !category.parentId);

  return <main className="admin-shell">
    <header className="admin-nav">
      <Link className="admin-mark" href="/">「不怕吃灰」收藏夹</Link>
      <nav aria-label="后台导航">
        <span className="admin-nav-active">整理工作台</span>
        <a href="/gallery">收藏展厅 <ArrowUpRight size={14} strokeWidth={1.6} /></a>
      </nav>
      <div className="admin-local-status"><span /> 本机资料库</div>
    </header>

    <div className="admin-canvas">
      <section className="admin-intro">
        <div>
          <p className="admin-kicker">COLLECTION DESK · 本地整理台</p>
          <h1>把散落的灵感，<br />收进自己的宇宙。</h1>
          <p className="admin-lead">同步、筛选与归档都在这里完成。默认保存在本机；使用推送时仅发送当日知识卡片。</p>
        </div>
        <div className="admin-intro-note" aria-label="当前概览">
          <span>当前视图</span>
          <strong>{statuses.find(([value]) => value === status)?.[1]}</strong>
          <p>{items.length} 条内容 · {rootCategories.length} 个一级目录 · 已完成行动 {actionStats.completed}/{actionStats.total}</p>
        </div>
      </section>

      <section className="admin-actions" aria-labelledby="admin-actions-title">
        <div className="admin-section-heading">
          <span id="admin-actions-title">功能区</span>
          <p>常用操作集中在这里，目录不再占用整理空间。</p>
        </div>
        <div className="admin-action-grid">
          <button className="admin-action admin-action-primary" disabled={syncingAll} onClick={syncAllPlatforms}>
            <span className="admin-action-icon"><Link2 size={20} strokeWidth={1.55} /></span>
            <span><strong>{syncingAll ? "正在同步收藏…" : "跨平台一键同步"}</strong><small>从已打开的收藏页导入</small></span>
            <ArrowUpRight className="admin-action-arrow" size={18} />
          </button>
          <button className="admin-action" disabled={organizing} onClick={organizeFirstImport}>
            <span className="admin-action-icon"><WandSparkles size={20} strokeWidth={1.55} /></span>
            <span><strong>{organizing ? "AI 正在整理…" : "AI 批量整理"}</strong><small>自动生成目录并归档</small></span>
          </button>
          <button className="admin-action" onClick={() => setFormOpen(!formOpen)}>
            <span className="admin-action-icon"><Plus size={20} strokeWidth={1.55} /></span>
            <span><strong>手动加入</strong><small>补充一条链接或灵感</small></span>
          </button>
          <button className="admin-action" onClick={() => setDirectoryOpen(true)}>
            <span className="admin-action-icon"><FolderTree size={20} strokeWidth={1.55} /></span>
            <span><strong>目录管理</strong><small>{rootCategories.length ? `${rootCategories.length} 个一级目录` : "创建你的分类结构"}</small></span>
          </button>
        </div>
        <div className="admin-utility-row">
          <button onClick={pairExtension}><Link2 size={15} /> 配对扩展</button>
          <button onClick={exportBackup}><Download size={15} /> 导出备份</button>
          <button onClick={() => backupInput.current?.click()}><Upload size={15} /> 导入 / 恢复</button>
          <input ref={backupInput} hidden type="file" accept="application/json,.json" onChange={importBackup} />
        </div>
      </section>

      <div className="admin-message" role="status"><span />{message}</div>

      {pairToken && <div className="admin-token"><span>扩展配对码</span><code>{pairToken}</code><button aria-label="关闭配对码" onClick={() => setPairToken("")}><X size={16} /></button></div>}

      {formOpen && <section className="admin-paper-panel admin-add-panel">
        <div className="admin-panel-heading"><div><span>NEW ENTRY</span><h2>手动加入收藏</h2></div><button aria-label="关闭手动加入" onClick={() => setFormOpen(false)}><X size={18} /></button></div>
        <form onSubmit={addItem} className="admin-form-grid">
          <label>平台<select value={form.platform} onChange={(e) => setForm({ ...form, platform: e.target.value })}><option>小红书</option><option>B站</option><option>知乎</option><option>微博</option></select></label>
          <label>来源<select value={form.sourceType} onChange={(e) => setForm({ ...form, sourceType: e.target.value })}><option value="favorite">收藏</option><option value="like">点赞（独立来源）</option></select></label>
          <label>标题<input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label>
          <label>原始链接<input required type="url" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} /></label>
          <label>作者<input value={form.author} onChange={(e) => setForm({ ...form, author: e.target.value })} /></label>
          <label>内容片段<input value={form.excerpt} onChange={(e) => setForm({ ...form, excerpt: e.target.value })} /></label>
          <button className="admin-solid-button">加入待整理</button>
        </form>
      </section>}

      <AdminDelivery />

      <section className="admin-workspace">
        <div className="admin-workspace-head">
          <div>
            <p className="admin-kicker">YOUR COLLECTIONS</p>
            <h2>收藏整理</h2>
          </div>
          <form className="admin-search" onSubmit={(event) => { event.preventDefault(); void load(); }}>
            <Search size={17} strokeWidth={1.5} />
            <input aria-label="搜索标题" placeholder="搜索标题" value={query} onChange={(e) => setQuery(e.target.value)} />
            <button type="submit">搜索</button>
          </form>
        </div>
        <div className="admin-filter-row">
          <div className="admin-tabs">{statuses.map(([value, label]) => <button key={value} onClick={() => { setStatus(value); setSelectedIds([]); }} className={status === value ? "is-active" : ""}>{label}</button>)}</div>
          {status === "trash" && <button className="admin-danger-link" onClick={emptyTrash}><Trash2 size={14} /> 清空回收站</button>}
        </div>

        {selectedIds.length > 0 && <div className="admin-selection"><strong>已选 {selectedIds.length} 条</strong><div>{statuses.filter(([value]) => value !== status).map(([value, label]) => <button key={value} onClick={() => void patchSelected(value)}>移至{label}</button>)}<button onClick={() => setSelectedIds([])}>取消</button></div></div>}

        <div className="admin-item-list">{items.length ? items.map((item) => <article key={item.id} className="admin-item-card">
          <label className="admin-check" htmlFor={`select-${item.id}`}><input id={`select-${item.id}`} type="checkbox" checked={selectedIds.includes(item.id)} onChange={(event) => setSelectedIds(event.target.checked ? [...selectedIds, item.id] : selectedIds.filter((id) => id !== item.id))} /><span /></label>
          <div className="admin-platform-mark">{item.platform.slice(0, 2)}</div>
          <div className="admin-item-body">
            <div className="admin-item-title"><a href={item.url} target="_blank" rel="noreferrer">{item.title} <ArrowUpRight size={13} /></a><span className="pill">{item.sourceType === "like" ? "点赞" : "收藏"}</span>{item.availability !== "available" && <span className="pill pill-warn">来源待核对</span>}</div>
            <p>{item.author || "未知作者"}{item.excerpt ? ` · ${item.excerpt}` : ""}</p>
            <div className="admin-item-tools"><select aria-label={`调整 ${item.title} 的目录`} value={item.categoryId || ""} onChange={(e) => void patchItem(item.id, { categoryId: e.target.value || null })}><option value="">未分类</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.parentId ? `　${category.name}` : category.name}</option>)}</select>{statuses.filter(([value]) => value !== item.status).map(([value, label]) => <button key={value} onClick={() => void patchItem(item.id, { status: value })}>{label}</button>)}<button className="admin-ai-button" onClick={() => void suggest(item.id)}><Sparkles size={13} /> AI 建议</button></div>
            {suggestionByItem[item.id] && <p className="admin-suggestion">AI 建议：{categories.find((c) => c.id === suggestionByItem[item.id].categoryId)?.name || "暂不归类"} · {JSON.parse(suggestionByItem[item.id].tags).join("、")} · 置信度 {suggestionByItem[item.id].confidence}%（不会自动写入）</p>}
          </div>
        </article>) : <div className="admin-empty"><span>EMPTY COLLECTION</span><h3>这里还没有内容</h3><p>先同步浏览器收藏，或手动加入一条链接。</p><button onClick={() => setFormOpen(true)}><Plus size={15} /> 手动加入</button></div>}</div>
      </section>
    </div>

    {directoryOpen && <div className="admin-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDirectoryOpen(false); }}>
      <section className="admin-directory-modal" role="dialog" aria-modal="true" aria-labelledby="directory-title">
        <div className="admin-directory-head"><div><span>COLLECTION INDEX</span><h2 id="directory-title">目录管理</h2><p>整理一级与二级目录，收藏卡片中的归类选项会同步更新。</p></div><button aria-label="关闭目录管理" onClick={() => setDirectoryOpen(false)}><X size={20} /></button></div>
        <div className="admin-directory-toolbar"><span>{rootCategories.length} 个一级目录 · {categories.length - rootCategories.length} 个二级目录</span><button onClick={() => void addCategory()}><Plus size={15} /> 新建一级目录</button></div>
        <div className="admin-directory-list">{rootCategories.length ? rootCategories.map((category, index) => <article key={category.id}>
          <div className="admin-directory-root"><span>{String(index + 1).padStart(2, "0")}</span><strong>{category.name}</strong><button onClick={() => void addCategory(category.id)}><Plus size={14} /> 添加二级</button></div>
          <div className="admin-directory-children">{categories.filter((child) => child.parentId === category.id).length ? categories.filter((child) => child.parentId === category.id).map((child) => <span key={child.id}>{child.name}</span>) : <em>暂时没有二级目录</em>}</div>
        </article>) : <div className="admin-directory-empty"><FolderTree size={28} strokeWidth={1.2} /><h3>还没有目录</h3><p>点击上方按钮手动创建，或使用 AI 批量整理自动生成。</p></div>}</div>
      </section>
    </div>}
  </main>;
}
