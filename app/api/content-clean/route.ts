import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { savedItems, settings } from "@/db/schema";
import { errorMessage, json } from "@/lib/http";

const keyFor = (id: string) => `content-clean:${id}`;
const cleanSchema = /^(ready|pending|failed)$/;
const textLimit = 120000;

async function localOnly(request: Request) {
  const url = new URL(request.url);
  if (request.headers.get("origin") === url.origin && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) return true;
  const token = request.headers.get("x-collection-token");
  if (!token) return false;
  const saved = await getDb().select().from(settings).where(eq(settings.key, "extension_token")).limit(1);
  return token === saved[0]?.value;
}

export async function GET(request: Request) {
  try {
    if (!await localOnly(request)) return json({ error: "请从本机收藏展厅读取清洗状态。" }, { status: 403 });
    const ids = [...new Set(new URL(request.url).searchParams.getAll("id").filter(Boolean))].slice(0, 20);
    if (!ids.length) return json({ items: [] });
    const rows = await getDb().select({ id: savedItems.id, url: savedItems.url, title: savedItems.title, platform: savedItems.platform, contentType: savedItems.contentType }).from(savedItems).where(inArray(savedItems.id, ids));
    const cached = await getDb().select().from(settings).where(and(...ids.map((id) => eq(settings.key, keyFor(id)))));
    const byId = new Map(cached.map((row) => [row.key.slice("content-clean:".length), JSON.parse(row.value)]));
    return json({ items: rows.map((row) => ({ ...row, clean: byId.get(row.id) || { status: "pending" } })) });
  } catch (error) { return json({ error: errorMessage(error) }, { status: 500 }); }
}

export async function POST(request: Request) {
  try {
    if (!await localOnly(request)) return json({ error: "请从本机收藏展厅保存清洗结果。" }, { status: 403 });
    const body = await request.json() as { items?: Array<{ id?: string; rawText?: string; cleanedText?: string; transcript?: string; status?: string; error?: string; sourceUrl?: string; method?: string }> };
    const incoming = (body.items || []).slice(0, 20);
    const db = getDb();
    const ids = incoming.map((item) => item.id).filter((id): id is string => Boolean(id));
    const existing = new Set((await db.select({ id: savedItems.id }).from(savedItems).where(inArray(savedItems.id, ids))).map((row) => row.id));
    const saved: string[] = [];
    for (const item of incoming) {
      if (!item.id || !existing.has(item.id)) continue;
      const status = cleanSchema.test(item.status || "") ? item.status : "failed";
      const rawText = String(item.rawText || "").trim().slice(0, textLimit);
      const cleanedText = String(item.cleanedText || "").trim().slice(0, textLimit);
      const transcript = String(item.transcript || "").trim().slice(0, textLimit);
      const value = { status, rawText, cleanedText, transcript, error: String(item.error || "").slice(0, 500), sourceUrl: String(item.sourceUrl || "").slice(0, 2000), method: String(item.method || "").slice(0, 80), extractedAt: Date.now() };
      await db.insert(settings).values({ key: keyFor(item.id), value: JSON.stringify(value), updatedAt: Date.now() }).onConflictDoUpdate({ target: settings.key, set: { value: JSON.stringify(value), updatedAt: Date.now() } });
      if (status === "ready" && (cleanedText || transcript || rawText)) {
        const excerpt = (cleanedText || transcript || rawText).slice(0, 3000);
        await db.update(savedItems).set({ excerpt, updatedAt: Date.now() }).where(eq(savedItems.id, item.id));
      }
      saved.push(item.id);
    }
    return json({ saved, ready: saved.filter((id) => incoming.find((item) => item.id === id)?.status === "ready").length });
  } catch (error) { return json({ error: errorMessage(error) }, { status: 500 }); }
}

