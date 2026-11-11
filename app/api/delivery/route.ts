import { env } from "cloudflare:workers";
import { desc, like } from "drizzle-orm";
import { getDb } from "@/db";
import { settings } from "@/db/schema";
import { errorMessage, json } from "@/lib/http";
import { validFeishuWebhook } from "@/lib/delivery";

export async function GET() {
  try {
    const [latest] = await getDb().select().from(settings)
      .where(like(settings.key, "knowledge_delivery_sent:feishu:%"))
      .orderBy(desc(settings.updatedAt)).limit(1);
    return json({ configured: validFeishuWebhook(env.FEISHU_WEBHOOK_URL || ""), lastSentAt: latest ? Number(latest.value) : null });
  } catch (error) { return json({ error: errorMessage(error) }, { status: 500 }); }
}
