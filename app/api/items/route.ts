import { and, desc, eq, like, or } from "drizzle-orm";
import { getDb } from "@/db";
import { savedItems } from "@/db/schema";
import { errorMessage, json } from "@/lib/http";

type IncomingItem = {
  platform?: string; sourceType?: string; sourceKey?: string; url?: string; title?: string;
  author?: string; coverUrl?: string; contentType?: string; sourceCollection?: string; excerpt?: string;
  isOwnContent?: boolean; isUnavailable?: boolean;
};

const unavailableTitle = /内容不存在|该内容已被删除|笔记不存在|内容不可见|已被删除|已隐藏|已失效|无法查看|暂时无法查看|页面不存在|404/i;
function stableSourceKey(platform: string, suppliedKey: string | undefined, url: string) {
  const path = (() => { try { return new URL(url).pathname; } catch { return ""; } })();
  const patterns: Record<string, RegExp> = {
    "小红书": /\/(?:explore|discovery\/item)\/([^/?#]+)/,
    "B站": /\/video\/([^/?#]+)/,
    "知乎": /\/(?:question|p)\/([^/?#]+)/,
    "微博": /\/detail\/([^/?#]+)/,
  };
  const id = patterns[platform]?.exec(path)?.[1];
  return id ? `${platform}:${id}` : suppliedKey?.trim() || url;
}

function clean(item: IncomingItem) {
  const url = item.url?.trim() ?? "";
  const title = item.title?.trim() ?? "未命名收藏";
  const platform = item.platform?.trim() || "网页";
  return {
    platform, sourceType: item.sourceType === "like" ? "like" : "favorite",
    sourceKey: stableSourceKey(platform, item.sourceKey, url || title), url, title, author: item.author?.trim() || null,
    coverUrl: item.coverUrl?.trim() || null, contentType: item.contentType?.trim() || "link",
    sourceCollection: item.sourceCollection?.trim() || null, excerpt: item.excerpt?.trim() || null,
  };
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const query = searchParams.get("q")?.trim();
    const predicates = [];
    if (status && status !== "all") predicates.push(eq(savedItems.status, status));
    if (query) predicates.push(like(savedItems.title, `%${query}%`));
    const rows = await getDb().select().from(savedItems).where(predicates.length ? and(...predicates) : undefined).orderBy(desc(savedItems.updatedAt));
    return json({ items: rows });
  } catch (error) {
    return json({ error: errorMessage(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as IncomingItem | { items: IncomingItem[] };
    const incoming = "items" in body ? body.items : [body];
    const db = getDb();
    const created: string[] = [];
    const updated: string[] = [];
    let skipped = 0;
    for (const source of incoming) {
      const item = clean(source);
      if (item.platform === "小红书" && (source.isOwnContent || source.isUnavailable || item.title === "未命名收藏" || unavailableTitle.test(item.title))) {
        skipped += 1;
        continue;
      }
      if (!item.url) continue;
      // The first extension prototype used a full URL as its source key. Match that
      // legacy form too, so a re-sync upgrades its metadata instead of duplicating it.
      const legacyNeedle = item.sourceKey.startsWith(`${item.platform}:`) ? item.sourceKey.slice(item.platform.length + 1) : "";
      const existing = await db.select({ id: savedItems.id }).from(savedItems).where(and(
        eq(savedItems.platform, item.platform),
        legacyNeedle ? or(eq(savedItems.sourceKey, item.sourceKey), like(savedItems.sourceKey, `%${legacyNeedle}%`), like(savedItems.url, `%${legacyNeedle}%`)) : eq(savedItems.sourceKey, item.sourceKey),
      )).limit(1);
      const now = Date.now();
      if (existing[0]) {
        await db.update(savedItems).set({ ...item, availability: "available", updatedAt: now }).where(eq(savedItems.id, existing[0].id));
        updated.push(existing[0].id);
      } else {
        const id = crypto.randomUUID();
        await db.insert(savedItems).values({ id, ...item, status: "inbox", availability: "available", categoryId: null, categorySource: "user", tags: "[]", createdAt: now, updatedAt: now });
        created.push(id);
      }
    }
    return json({ created, updated, skipped }, { status: 201 });
  } catch (error) {
    return json({ error: errorMessage(error) }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = (await request.json()) as { id?: string; status?: string; categoryId?: string | null; tags?: string[]; availability?: string };
    if (!body.id) return json({ error: "缺少收藏 ID" }, { status: 400 });
    const allowed = new Set(["inbox", "kept", "later", "trash"]);
    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (body.status && allowed.has(body.status)) patch.status = body.status;
    if (body.categoryId !== undefined) { patch.categoryId = body.categoryId; patch.categorySource = "user"; }
    if (body.tags) patch.tags = JSON.stringify(body.tags.slice(0, 12));
    if (body.availability) patch.availability = body.availability;
    await getDb().update(savedItems).set(patch).where(eq(savedItems.id, body.id));
    return json({ ok: true });
  } catch (error) {
    return json({ error: errorMessage(error) }, { status: 500 });
  }
}
