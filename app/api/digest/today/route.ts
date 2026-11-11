import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { actionPlans, categories, digests, retentionEvents, savedItems } from "@/db/schema";
import { errorMessage, json } from "@/lib/http";

const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(new Date());

const safeJson = <T,>(value: string, fallback: T): T => {
  try { return JSON.parse(value) as T; } catch { return fallback; }
};

const retentionScore: Record<string, number> = { applied: 100, read: 70, later: 40, not_interested: 0 };
const beautyMatcher = /美妆|穿搭|妆容|护肤|美甲|我想变美/i;

function beautyCategoryIds(rows: (typeof categories.$inferSelect)[]) {
  const ids = new Set(rows.filter((category) => !category.parentId && beautyMatcher.test(category.name)).map((category) => category.id));
  let previousSize = -1;
  while (previousSize !== ids.size) {
    previousSize = ids.size;
    rows.forEach((category) => { if (category.parentId && ids.has(category.parentId)) ids.add(category.id); });
  }
  return ids;
}

async function hydrate(db: ReturnType<typeof getDb>, digest: typeof digests.$inferSelect | null) {
  if (!digest) return { digest: null, items: [], retention: { total: 0, judged: 0, retained: 0, score: 0, byItem: {} }, actionPlans: [] };
  const ids = safeJson<string[]>(digest.itemIds, []);
  const rows = ids.length ? await db.select().from(savedItems).where(inArray(savedItems.id, ids)) : [];
  const events = await db.select().from(retentionEvents).where(eq(retentionEvents.digestId, digest.id)).orderBy(desc(retentionEvents.createdAt));
  const plans = ids.length ? await db.select().from(actionPlans).where(inArray(actionPlans.itemId, ids)) : [];
  const byItem: Record<string, { action: string; score: number; createdAt: number }> = {};
  for (const event of events) if (!byItem[event.itemId]) byItem[event.itemId] = { action: event.action, score: retentionScore[event.action] ?? 0, createdAt: event.createdAt };
  const judged = Object.keys(byItem).length;
  const score = judged ? Math.round(Object.values(byItem).reduce((sum, value) => sum + value.score, 0) / judged) : 0;
  return {
    digest,
    items: ids.map((id) => rows.find((item) => item.id === id)).filter(Boolean),
    retention: { total: ids.length, judged, retained: Object.values(byItem).filter((value) => value.score >= 70).length, score, byItem },
    actionPlans: plans.map((plan) => ({ ...plan, steps: safeJson(plan.steps, []) })),
  };
}

export async function GET() {
  try {
    const db = getDb();
    const digest = await db.select().from(digests).where(eq(digests.digestDate, today())).limit(1);
    if (digest[0]) return json(await hydrate(db, digest[0]));
    return json(await createDigest(db, today()));
  } catch (error) { return json({ error: errorMessage(error) }, { status: 500 }); }
}

async function createDigest(db: ReturnType<typeof getDb>, date: string, refresh = false) {
    const existing = await db.select().from(digests).where(eq(digests.digestDate, date)).limit(1);
    if (existing[0] && !refresh) return { ...(await hydrate(db, existing[0])), reused: true };
    const previous = await db.select().from(digests).orderBy(desc(digests.createdAt)).limit(28);
    const used = new Set(previous.flatMap((d) => JSON.parse(d.itemIds) as string[]));
    const categoryRows = await db.select().from(categories);
    const beautyIds = beautyCategoryIds(categoryRows);
    const candidates = await db.select().from(savedItems).where(and(eq(savedItems.status, "kept"), eq(savedItems.availability, "available")));
    const eligible = candidates.filter((item) => !beautyIds.has(item.categoryId || "") && !beautyMatcher.test(`${item.title} ${item.excerpt || ""}`));
    const fresh = eligible.filter((item) => !used.has(item.id));
    const pool = fresh.length >= 3 ? fresh : eligible;
    const shuffled = [...pool].sort(() => Math.random() - 0.5);
    const chosen = shuffled.slice(0, 3);
    const digest = { id: existing[0]?.id || crypto.randomUUID(), digestDate: date, itemIds: JSON.stringify(chosen.map((item) => item.id)), deliveryState: "queued", createdAt: Date.now() };
    if (existing[0]) await db.update(digests).set({ itemIds: digest.itemIds, deliveryState: digest.deliveryState, createdAt: digest.createdAt }).where(eq(digests.id, existing[0].id));
    else await db.insert(digests).values(digest).onConflictDoNothing();
    const stored = await db.select().from(digests).where(eq(digests.digestDate, date)).limit(1);
    return { ...(await hydrate(db, stored[0] || digest)), reused: Boolean(stored[0] && stored[0].id !== digest.id) };
}

export async function POST(request: Request) {
  try {
    const db = getDb(); const date = today();
    const refresh = new URL(request.url).searchParams.get("refresh") === "1";
    return json(await createDigest(db, date, refresh));
  } catch (error) { return json({ error: errorMessage(error) }, { status: 500 }); }
}
