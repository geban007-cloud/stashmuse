import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { settings } from "@/db/schema";
import { errorMessage, json } from "@/lib/http";

const key = "wechat_delivery";
type WechatConfig = { enabled: boolean; webhookUrl: string; recipient: string; deliveryTime: string; dailyCount: number; categories: string[]; accessToken?: string };

function readConfig(value?: string): WechatConfig {
  if (!value) return { enabled: false, webhookUrl: "", recipient: "", deliveryTime: "09:00", dailyCount: 3, categories: [] };
  try { return { enabled: false, webhookUrl: "", recipient: "", deliveryTime: "09:00", dailyCount: 3, categories: [], ...JSON.parse(value) } as WechatConfig; } catch { return { enabled: false, webhookUrl: "", recipient: "", deliveryTime: "09:00", dailyCount: 3, categories: [] }; }
}

export async function GET() {
  try {
    const row = await getDb().select().from(settings).where(eq(settings.key, key)).limit(1);
    const config = readConfig(row[0]?.value);
    return json({ config: { ...config, accessToken: undefined, connected: Boolean(config.webhookUrl) } });
  } catch (error) { return json({ error: errorMessage(error) }, { status: 500 }); }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as Partial<WechatConfig>;
    const webhookUrl = body.webhookUrl?.trim() || "";
    if (webhookUrl) {
      let parsed: URL;
      try { parsed = new URL(webhookUrl); } catch { return json({ error: "WorkBuddy 地址格式不正确" }, { status: 400 }); }
      if (!['http:', 'https:'].includes(parsed.protocol)) return json({ error: "WorkBuddy 地址必须使用 HTTP 或 HTTPS" }, { status: 400 });
    }
    const config: WechatConfig = { enabled: Boolean(body.enabled && webhookUrl), webhookUrl, recipient: body.recipient?.trim() || "我的微信", deliveryTime: /^\d{2}:\d{2}$/.test(body.deliveryTime || "") ? body.deliveryTime! : "09:00", dailyCount: Math.min(3, Math.max(1, Number(body.dailyCount) || 3)), categories: Array.isArray(body.categories) ? body.categories.slice(0, 20) : [], accessToken: body.accessToken?.trim() || undefined };
    const db = getDb();
    await db.delete(settings).where(eq(settings.key, key));
    await db.insert(settings).values({ key, value: JSON.stringify(config), updatedAt: Date.now() });
    return json({ config: { ...config, accessToken: undefined, connected: Boolean(webhookUrl) } });
  } catch (error) { return json({ error: errorMessage(error) }, { status: 500 }); }
}
