import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { digests, retentionEvents, savedItems } from "@/db/schema";
import { errorMessage, json } from "@/lib/http";

const allowedActions = new Set(["read", "applied", "later", "not_interested"]);

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const itemId = searchParams.get("itemId");
    const db = getDb();
    const rows = await db.select().from(retentionEvents).where(itemId ? eq(retentionEvents.itemId, itemId) : undefined).orderBy(desc(retentionEvents.createdAt));
    return json({ events: rows });
  } catch (error) { return json({ error: errorMessage(error) }, { status: 500 }); }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { digestId?: string; itemId?: string; action?: string };
    if (!body.digestId || !body.itemId || !body.action || !allowedActions.has(body.action)) return json({ error: "反馈参数不完整" }, { status: 400 });
    const db = getDb();
    const digest = await db.select({ id: digests.id }).from(digests).where(eq(digests.id, body.digestId)).limit(1);
    const item = await db.select({ id: savedItems.id }).from(savedItems).where(eq(savedItems.id, body.itemId)).limit(1);
    if (!digest[0] || !item[0]) return json({ error: "今日回看内容不存在" }, { status: 404 });
    await db.insert(retentionEvents).values({ id: crypto.randomUUID(), digestId: body.digestId, itemId: body.itemId, action: body.action, createdAt: Date.now() });
    return json({ ok: true, action: body.action });
  } catch (error) { return json({ error: errorMessage(error) }, { status: 500 }); }
}
