"use client";

import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { safeCoverUrl } from "@/lib/outfit";

type Item = { id: string; title: string; url: string; coverUrl?: string | null; platform?: string; excerpt?: string | null; contentType?: string };
type Section = { title: string; text: string; sourceIds: string[] };
type Plan = { title: string; advice: string; parts: { area: string; advice: string; sourceIds: string[] }[] };
type SummaryResult = { overview: string; sections: Section[]; gaps: string[] };
type AssistantResult = { plans: Plan[] };
type Selection = { count: number; fallback?: boolean; items: { id: string; score: number; reason: string }[] };
type Insight = {
  result: SummaryResult | AssistantResult;
  selection?: Selection;
  scope: { count: number; selectedCount?: number; withExcerpts: number; totalWithExcerpts?: number; shortened: boolean };
  generatedAt: number;
  cached: boolean;
  visual?: { enabled: boolean; selected: number; analyzedIds: string[]; cached: boolean; warning: string };
};

export function GalleryDialog({ title, kicker, onClose, children }: { title: string; kicker: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const dialog = ref.current;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog?.showModal();
    return () => { dialog?.close(); document.body.style.overflow = overflow; previous?.focus(); };
  }, []);
  return <dialog ref={ref} className="gallery-modal gallery-native-dialog" aria-label={title} onCancel={onClose} onClick={(event) => {
    if (event.target !== event.currentTarget) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose();
  }}>
    <div className="modal-heading"><div><span className="modal-kicker">{kicker}</span><h1>{title}</h1></div><button className="modal-close" onClick={onClose} aria-label="关闭">×</button></div>
    {children}
  </dialog>;
}

function SourceLinks({ ids, items, visual }: { ids: string[]; items: Item[]; visual?: Insight["visual"] }) {
  return <div className="insight-sources">{ids.map((id) => {
    const item = items.find((candidate) => candidate.id === id);
    if (!item || !/^https?:\/\//i.test(item.url)) return null;
    const cover = safeCoverUrl(item.coverUrl);
    const platform = ({ xiaohongshu: "小红书", xhs: "小红书", bilibili: "B 站", zhihu: "知乎", weibo: "微博" } as Record<string, string>)[item.platform || ""] || item.platform || "原笔记";
    return <a key={id} className={visual ? "outfit-source-card" : undefined} href={item.url} target="_blank" rel="noreferrer">
      {visual && cover && <img src={cover} alt="" loading="lazy" referrerPolicy="no-referrer" onError={(e) => { e.currentTarget.style.display = "none"; }} />}
      <span>↗ {item.title}{visual && <small>{platform}</small>}</span>
    </a>;
  })}</div>;
}

function directAdvice(value: string) {
  const marker = /(?:^|[。；;]\s*)延伸建议\s*[：:]\s*/;
  const match = marker.exec(value);
  return (match ? value.slice(match.index + match[0].length) : value).trim();
}

export function InsightPanel({ mode, items, scopeItems = items }: { mode: "assistant" | "summary"; items: Item[]; scopeItems?: Item[] }) {
  const [colour, setColour] = useState("");
  const [occasion, setOccasion] = useState("");
  const [season, setSeason] = useState("不限");
  const [style, setStyle] = useState("");
  const [busy, setBusy] = useState(mode === "summary" && scopeItems.length > 0);
  const [error, setError] = useState("");
  const [data, setData] = useState<Insight | null>(null);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);

  const generate = useCallback(async (refresh = false) => {
    controller.current?.abort();
    const request = new AbortController();
    controller.current = request;
    const timer = setTimeout(() => request.abort("timeout"), 150000);
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/gallery-insights", {
        method: "POST", headers: { "content-type": "application/json" }, signal: request.signal,
        body: JSON.stringify({ mode, itemIds: mode === "summary" ? scopeItems.map((item) => item.id) : [], colour: colour || "不限", occasion: occasion || "日常", season, style, refresh, useImages: mode === "assistant" }),
      });
      const result = await response.json() as Insight & { error?: string };
      if (!response.ok) throw new Error(result.error || "生成失败，请重试。");
      if (!request.signal.aborted && controller.current === request) setData(result as Insight);
    } catch (cause) {
      if (controller.current === request) {
        if (!request.signal.aborted) setError(cause instanceof Error ? cause.message : "无法连接本地服务。");
        else if (request.signal.reason === "timeout") setError("等待超时，请稍后重试。");
      }
    } finally { clearTimeout(timer); if (controller.current === request) setBusy(false); }
  }, [mode, scopeItems, colour, occasion, season, style]);
  useEffect(() => {
    if (mode !== "summary" || !scopeItems.length) return;
    // Delay dispatch by one tick so Strict Mode's setup/cleanup probe does not
    // send two paid generation requests. The API reads its local cache first.
    const start = setTimeout(() => { void generate(); }, 0);
    return () => { clearTimeout(start); controller.current?.abort(); };
  }, [mode, scopeItems.length, generate]);
  return <div className="modal-content insight-content">
    <p className="insight-intro">{mode === "assistant" ? "从你已保留的收藏中，搭配发型、妆容、服装与美甲。先说说这次想要的感觉。" : `先从当前主题的 ${scopeItems.length} 条已保留收藏中精选最多 10 条，再基于精选内容梳理共同主题、不同观点和可用的方法。`}</p>
    {mode === "assistant" && <form onSubmit={(event) => { event.preventDefault(); void generate(); }}>
      {mode === "assistant" && <fieldset disabled={busy} className="assistant-fields">
        <label>想要的色系<input maxLength={120} value={colour} onChange={(e) => { setColour(e.target.value); setData(null); }} placeholder="如：蓝白、低饱和、黑灰" /></label>
        <label>准备去的场合<input maxLength={120} value={occasion} onChange={(e) => { setOccasion(e.target.value); setData(null); }} placeholder="如：通勤、约会、周末看展" /></label>
        <label>季节<select value={season} onChange={(e) => { setSeason(e.target.value); setData(null); }}>{["不限", "春季", "夏季", "秋季", "冬季", "换季"].map((name) => <option key={name}>{name}</option>)}</select></label>
        <label>其他偏好（选填）<input maxLength={200} value={style} onChange={(e) => { setStyle(e.target.value); setData(null); }} placeholder="如：简洁知性、平底鞋、不露肩" /></label>
      </fieldset>}
      <div className="insight-actions"><button className="gallery-action" disabled={busy} type="submit">{busy ? "正在整理，请稍候…" : "生成搭配方案"}</button>{data && <button type="button" className="insight-refresh" disabled={busy} onClick={() => void generate(true)}>重新生成</button>}</div>
    </form>}
    {mode === "summary" && !scopeItems.length && <div className="gallery-empty">这个主题还没有已保留的收藏，先整理一些内容，再来查看内容精华。</div>}
    {busy && <p className="insight-loading" role="status">{mode === "assistant" ? "正在读取候选封面、协调搭配并核对引用，可能需要 1–2 分钟。" : data ? "正在更新内容精华，原内容仍可阅读…" : `正在从 ${scopeItems.length} 条收藏中筛选并整理最多 10 条，首次生成通常需要几十秒…`}</p>}
    {mode === "summary" && busy && <p className="insight-disclosure">优先读取本机已保存的结果；需要生成时，相关收藏的标题与文字片段会发送至 DeepSeek，结果保存在本机。</p>}
    {error && <p className="gallery-error" role="alert">{error}</p>}
    {mode === "summary" && error && <button type="button" className="insight-refresh" disabled={busy} onClick={() => void generate()}>重试读取 / 整理</button>}
    {data && <div className={"plans" in data.result ? "insight-result assistant-result" : "insight-result"} aria-live="polite">
      {"sections" in data.result && <>
        <p className="insight-meta">{data.cached ? "本机已保存" : "已生成并保存到本机"} · {new Date(data.generatedAt).toLocaleString("zh-CN")}<br />从 {data.scope.count} 条收藏中精选 {data.scope.selectedCount ?? data.scope.count} 条，其中精选内容有 {data.scope.withExcerpts} 条文字片段{data.scope.shortened ? "；较长文字已截短" : ""}。仅有标题的内容不能视作全文结论。</p>
        {data.selection?.items.length ? <aside className="insight-selection"><strong>本次精选</strong><span>{data.selection.fallback ? "模型筛选暂不可用，已按信息密度自动补选。" : "按信息密度、代表性和差异性筛选。"}</span><div>{data.selection.items.map((entry, index) => { const item = items.find((candidate) => candidate.id === entry.id); return item ? <a key={entry.id} href={item.url} target="_blank" rel="noreferrer"><b>{String(index + 1).padStart(2, "0")}</b><span>{item.title}<small>{entry.reason}</small></span></a> : null; })}</div></aside> : null}
        <p className="insight-overview">{data.result.overview}</p>
        {data.result.sections.map((section, index) => <article className="insight-section" key={index}><span className="insight-number">{String(index + 1).padStart(2, "0")}</span><h2>{section.title}</h2><p>{section.text}</p><SourceLinks ids={section.sourceIds} items={items} /></article>)}
        {data.result.gaps.length > 0 && <aside className="insight-caveats"><h3>素材与结论的边界</h3><ul>{data.result.gaps.map((gap, i) => <li key={i}>{gap}</li>)}</ul></aside>}
        <div className="insight-actions"><button type="button" className="insight-refresh" disabled={busy} onClick={() => void generate(true)}>重新整理</button></div>
      </>}
      {"plans" in data.result && data.result.plans.map((plan, index) => <article className="outfit-plan" key={index}><span className="insight-number">方案 {index + 1}</span><h2>{plan.title}</h2><p>{plan.advice}</p><div className="outfit-parts">{plan.parts.map((part) => <section key={part.area}><h3>{part.area}</h3><p>{directAdvice(part.advice)}</p>{part.sourceIds.length ? <SourceLinks ids={part.sourceIds} items={items} visual={data.visual} /> : null}</section>)}</div></article>)}
    </div>}
  </div>;
}
