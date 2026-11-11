import { env } from "cloudflare:workers";
import { eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { digests, savedItems, settings } from "@/db/schema";
import { errorMessage, json } from "@/lib/http";
import { deliverySentKey, validFeishuWebhook } from "@/lib/delivery";

const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(new Date());
const safeLink = (value: string) => { try { const url = new URL(value); return ["http:", "https:"].includes(url.protocol) ? url.href : ""; } catch { return ""; } };

export async function POST() {
  try {
    const webhook = env.FEISHU_WEBHOOK_URL || "";
    if (!validFeishuWebhook(webhook)) return json({ error: "飞书机器人地址未配置或格式不正确" }, { status: 400 });
    const db = getDb();
    const date = today();
    const sentKey = deliverySentKey(date);
    const sent = await db.select().from(settings).where(eq(settings.key, sentKey)).limit(1);
    if (sent[0]) return json({ ok: true, skipped: true, message: "今天已经发送到飞书" });
    const digest = await db.select().from(digests).where(eq(digests.digestDate, date)).limit(1);
    if (!digest[0]) return json({ error: "请先生成今日知识卡片" }, { status: 400 });
    const ids = JSON.parse(digest[0].itemIds) as string[];
    const rows = ids.length ? await db.select().from(savedItems).where(inArray(savedItems.id, ids)) : [];
    const cards = ids.map((id) => rows.find((row) => row.id === id)).filter((row): row is typeof savedItems.$inferSelect => row !== undefined && Boolean(safeLink(row.url)));
    if (!cards.length) return json({ error: "今天还没有可发送的知识卡片" }, { status: 400 });
    const content = `今日知识卡片 · ${date}\n\n${cards.map((card, index) => `${index + 1}. ${card.title}\n${(card.excerpt || "回看这条收藏").slice(0, 250)}\n${safeLink(card.url)}`).join("\n\n")}`;
    const response = await fetch(webhook, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ msg_type: "text", content: { text: content } }) });
    const responseText = await response.text();
    if (!response.ok) throw new Error(`飞书发送失败（${response.status}）：${responseText.slice(0, 180)}`);
    const result = JSON.parse(responseText) as { code?: number; StatusCode?: number; msg?: string; StatusMessage?: string };
    if ((result.code ?? result.StatusCode) !== 0) throw new Error(`飞书发送失败：${result.msg || result.StatusMessage || "未知错误"}`);
    await db.insert(settings).values({ key: sentKey, value: String(Date.now()), updatedAt: Date.now() }).onConflictDoNothing();
    return json({ ok: true, count: cards.length, date });
  } catch (error) { return json({ error: errorMessage(error) }, { status: 502 }); }
}
