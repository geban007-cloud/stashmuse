import { env } from "cloudflare:workers";
import { eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { digests, savedItems, settings } from "@/db/schema";
import { readPublicContext, looksLikeTimestampTitle } from "@/lib/content-context";
import { errorMessage, json } from "@/lib/http";

type EnrichBody = { digestId?: string; itemIds?: string[] };
type EnrichResult = { id: string; title?: string; summary?: string };

function parseModel(value: string) {
  try {
    const parsed = JSON.parse(value) as { items?: EnrichResult[] };
    return Array.isArray(parsed.items) ? parsed.items : [];
  } catch {
    return [];
  }
}

function fallbackTitle(item: typeof savedItems.$inferSelect, pageTitle: string) {
  const title = pageTitle.trim();
  if (title && !looksLikeTimestampTitle(title) && !/Sina Visitor System|微博/i.test(title)) return title.slice(0, 120);
  return item.platform === "微博" ? "微博内容" : item.title;
}

export async function POST(request: Request) {
  try {
    const origin = request.headers.get("origin");
    const url = new URL(request.url);
    if (origin !== url.origin || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) return json({ error: "请从本机收藏展厅发起摘要生成。" }, { status: 403 });
    const body = await request.json() as EnrichBody;
    const ids = [...new Set((body.itemIds || []).filter(Boolean))].slice(0, 3);
    if (!ids.length) return json({ items: [] });
    const db = getDb();
    if (body.digestId) {
      const digest = await db.select({ id: digests.id }).from(digests).where(eq(digests.id, body.digestId)).limit(1);
      if (!digest[0]) return json({ error: "今日卡片不存在" }, { status: 404 });
    }
    const rows = await db.select().from(savedItems).where(inArray(savedItems.id, ids));
    const cleanRows = await db.select().from(settings).where(inArray(settings.key, ids.map((id) => `content-clean:${id}`)));
    const cleanById = new Map(cleanRows.map((row) => {
      try { return [row.key.slice("content-clean:".length), JSON.parse(row.value) as { status?: string; cleanedText?: string; transcript?: string; rawText?: string }]; }
      catch { return [row.key.slice("content-clean:".length), {}]; }
    }));
    const contexts = await Promise.all(rows.map(async (item) => {
      const clean = cleanById.get(item.id);
      const cachedText = clean?.status === "ready" ? (clean.cleanedText || clean.transcript || clean.rawText || "").slice(0, 12000) : "";
      const publicContext = cachedText ? { text: cachedText, pageTitle: item.title, description: "", blocked: false } : await readPublicContext(item);
      return { item, context: publicContext, needsEnrichment: !item.excerpt?.trim() || looksLikeTimestampTitle(item.title) };
    }));
    const pending = contexts.filter((entry) => entry.needsEnrichment);
    if (!pending.length) return json({ items: rows, enriched: 0 });

    let generated: EnrichResult[] = [];
    if (env.DEEPSEEK_API_KEY) {
      const messages: Array<{ role: "system" | "user"; content: string | Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }> }> = [
        { role: "system", content: '你是个人收藏摘要编辑。只输出 JSON，格式为 {"items":[{"id":"真实ID","title":"不超过36字的内容标题","summary":"不超过90字的准确摘要"}]}。只能依据输入正文、页面描述或封面可见事实；不能把日期当标题，不能编造正文。若正文被平台拦截，标题要诚实概括为“微博内容”或根据封面可见事实命名，摘要必须明确“正文暂时无法读取”，再补充有限的可见信息。每个ID都必须来自输入。',
        },
        { role: "user", content: pending.flatMap(({ item, context }) => {
          const parts: Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }> = [{ type: "text", text: JSON.stringify({ id: item.id, platform: item.platform, title: item.title, url: item.url, text: (context.text || context.description || "").slice(0, 9000), blocked: context.blocked }) }];
          if (context.blocked && item.coverUrl && /^https?:\/\//i.test(item.coverUrl)) parts.push({ type: "image_url", image_url: { url: item.coverUrl } });
          return parts;
        }) },
      ];
      try {
        const response = await fetch("https://api.deepseek.com/chat/completions", { method: "POST", signal: AbortSignal.timeout(45000), headers: { authorization: `Bearer ${env.DEEPSEEK_API_KEY}`, "content-type": "application/json" }, body: JSON.stringify({ model: "deepseek-flash", thinking: { type: "disabled" }, temperature: .2, max_tokens: 1800, response_format: { type: "json_object" }, messages }) });
        if (response.ok) {
          const payload = await response.json() as { choices?: { message?: { content?: string } }[] };
          generated = parseModel(payload.choices?.[0]?.message?.content || "{}");
        }
      } catch { /* Use a transparent local fallback below. */ }
    }
    const generatedById = new Map(generated.map((entry) => [entry.id, entry]));
    for (const { item, context } of pending) {
      const ai = generatedById.get(item.id);
      const summary = (ai?.summary || context.description || context.text.slice(0, 160) || `${item.platform} 正文暂时无法读取，请打开原文查看。`).trim().slice(0, 3000);
      const title = fallbackTitle(item, ai?.title || context.pageTitle);
      await db.update(savedItems).set({ title, excerpt: summary, updatedAt: Date.now() }).where(eq(savedItems.id, item.id));
    }
    const refreshed = await db.select().from(savedItems).where(inArray(savedItems.id, ids));
    return json({ items: refreshed, enriched: pending.length });
  } catch (error) { return json({ error: errorMessage(error) }, { status: 500 }); }
}
