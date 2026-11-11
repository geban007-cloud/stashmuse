import { desc, eq } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { getDb } from "@/db";
import { categories, savedItems, suggestions } from "@/db/schema";
import { errorMessage, json } from "@/lib/http";

type AiAnswer = { categoryId: string | null; tags: string[]; confidence: number };

export async function POST(request: Request) {
  try {
    if (!env.DEEPSEEK_API_KEY) return json({ error: "AI 分类未启用。请在本机环境中设置 DEEPSEEK_API_KEY；手动整理不受影响。", code: "AI_DISABLED" }, { status: 503 });
    const { itemId } = (await request.json()) as { itemId?: string };
    if (!itemId) return json({ error: "缺少收藏 ID" }, { status: 400 });
    const db = getDb();
    const [item] = await db.select().from(savedItems).where(eq(savedItems.id, itemId)).limit(1);
    if (!item) return json({ error: "收藏不存在" }, { status: 404 });
    const directory = await db.select().from(categories);
    if (!directory.length) return json({ error: "请先建立至少一个分类目录" }, { status: 400 });
    const validIds = directory.map((category) => category.id);
    const label = directory.map((category) => `${category.id}：${category.parentId ? "二级" : "一级"} ${category.name}`).join("\n");
    const response = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: { authorization: `Bearer ${env.DEEPSEEK_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: "deepseek-chat",
        temperature: 0.2,
        max_tokens: 300,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "你是个人收藏整理助手。只提出建议，绝不代表用户修改收藏。必须只输出有效 JSON，不要 Markdown。格式示例：{\"categoryId\":\"目录ID或null\",\"tags\":[\"标签\"],\"confidence\":80}" },
          { role: "user", content: `目录：\n${label}\n\n收藏：\n标题：${item.title}\n作者：${item.author ?? "未知"}\n内容片段：${item.excerpt ?? "无"}\n链接：${item.url}\n\n只依据提供内容选择最合适的已有目录；不确定时 categoryId 为 null。给 1 到 5 个简短中文检索标签。` },
        ],
      }),
    });
    if (!response.ok) return json({ error: "AI 分类服务暂时不可用，请继续手动整理。" }, { status: 502 });
    const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const answer = JSON.parse(payload.choices?.[0]?.message?.content || "") as AiAnswer;
    const suggestion = {
      id: crypto.randomUUID(), itemId, categoryId: validIds.includes(answer.categoryId ?? "") ? answer.categoryId : null,
      tags: JSON.stringify((answer.tags ?? []).map((tag) => tag.trim()).filter(Boolean).slice(0, 5)),
      confidence: Math.max(0, Math.min(100, Math.round(answer.confidence ?? 0))), createdAt: Date.now(),
    };
    await db.insert(suggestions).values(suggestion);
    const recent = await db.select().from(suggestions).where(eq(suggestions.itemId, itemId)).orderBy(desc(suggestions.createdAt)).limit(1);
    return json({ suggestion: recent[0] });
  } catch (error) { return json({ error: errorMessage(error) }, { status: 500 }); }
}
