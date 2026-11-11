import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { digests, savedItems, settings } from "@/db/schema";
import { errorMessage, json } from "@/lib/http";

const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(new Date());

export async function POST(request: Request) {
  try {
    const db = getDb();
    const configRow = await db.select().from(settings).where(eq(settings.key, "wechat_delivery")).limit(1);
    if (!configRow[0]) return json({ error: "请先连接 WorkBuddy" }, { status: 400 });
    const config = JSON.parse(configRow[0].value) as { enabled: boolean; webhookUrl: string; recipient: string; accessToken?: string; dailyCount?: number };
    if (!config.webhookUrl) return json({ error: "还没有填写 WorkBuddy 地址" }, { status: 400 });
    const body = await request.json().catch(() => ({})) as { force?: boolean };
    if (!config.enabled && !body.force) return json({ error: "自动推送尚未开启" }, { status: 409 });
    const date = today();
    let digest = (await db.select().from(digests).where(eq(digests.digestDate, date)).limit(1))[0];
    if (!digest) {
      const previous = await db.select().from(digests).orderBy(desc(digests.createdAt)).limit(28);
      const used = new Set(previous.flatMap((row) => { try { return JSON.parse(row.itemIds) as string[]; } catch { return []; } }));
      const candidates = await db.select().from(savedItems).where(and(eq(savedItems.status, "kept"), eq(savedItems.availability, "available"))).orderBy(desc(savedItems.updatedAt));
      const chosen = candidates.filter((item) => !used.has(item.id)).slice(0, Math.min(3, config.dailyCount || 3));
      digest = { id: crypto.randomUUID(), digestDate: date, itemIds: JSON.stringify(chosen.map((item) => item.id)), deliveryState: "queued", createdAt: Date.now() };
      await db.insert(digests).values(digest);
    }
    if (digest.deliveryState === "sent" && !body.force) return json({ ok: true, skipped: true, message: "今日卡片已经发送过了" });
    const ids = JSON.parse(digest.itemIds) as string[];
    const rows = ids.length ? await db.select().from(savedItems).where(inArray(savedItems.id, ids)) : [];
    const payload = { type: "knowledge_digest", digestId: digest.id, date, recipient: config.recipient || "我的微信", cards: ids.map((id) => rows.find((item) => item.id === id)).filter(Boolean).map((item) => ({ id: item!.id, digestId: digest!.id, title: item!.title, platform: item!.platform, excerpt: item!.excerpt || "打开链接回看这条收藏。", url: item!.url, feedback: { read: { label: "已看", action: "read" }, applied: { label: "想应用", action: "applied" }, later: { label: "稍后", action: "later" }, not_interested: { label: "不需要", action: "not_interested" } } })), callbackUrl: new URL("/api/retention", request.url).toString() };
    const response = await fetch(config.webhookUrl, { method: "POST", headers: { "content-type": "application/json", ...(config.accessToken ? { authorization: `Bearer ${config.accessToken}`, "x-workbuddy-token": config.accessToken } : {}) }, body: JSON.stringify(payload) });
    if (!response.ok) throw new Error(`WorkBuddy 返回 ${response.status}`);
    await db.update(digests).set({ deliveryState: "sent" }).where(eq(digests.id, digest.id));
    return json({ ok: true, digestId: digest.id, count: payload.cards.length, payload });
  } catch (error) { return json({ error: errorMessage(error) }, { status: 502 }); }
}
