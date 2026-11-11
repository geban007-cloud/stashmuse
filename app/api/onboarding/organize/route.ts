import { and, asc, eq, isNull } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { getDb } from "@/db";
import { categories, savedItems, suggestions } from "@/db/schema";
import { errorMessage, json } from "@/lib/http";

type DeepSeekResponse = { choices?: Array<{ message?: { content?: string } }> };
type SuggestedCategory = { name?: string; children?: SuggestedCategory[] };
type Assignment = { itemId?: string; categoryCode?: string; tags?: string[]; confidence?: number };
type OrganizeItem = { id: string; title: string; excerpt: string | null };

async function deepseekJson(system: string, user: string) {
  const response = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: { authorization: `Bearer ${env.DEEPSEEK_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ model: "deepseek-chat", temperature: 0.2, max_tokens: 8000, response_format: { type: "json_object" }, messages: [{ role: "system", content: system }, { role: "user", content: user }] }),
  });
  if (!response.ok) throw new Error("DeepSeek 暂时不可用，请稍后重试。");
  const payload = await response.json() as DeepSeekResponse;
  return JSON.parse(payload.choices?.[0]?.message?.content || "");
}

function cleanName(value: unknown) {
  return typeof value === "string" ? value.trim().slice(0, 40) : "";
}

async function createHierarchy(db: ReturnType<typeof getDb>, items: OrganizeItem[], createdCategories: string[]) {
  const source = items.slice(0, 240).map((item) => `- ${item.title.slice(0, 120)}${item.excerpt ? `：${item.excerpt.slice(0, 80)}` : ""}`).join("\n");
  const result = await deepseekJson(
    "你是个人知识收藏整理助手。必须只输出有效 JSON，不要 Markdown。输出格式：{\"categories\":[{\"name\":\"一级分类名\",\"children\":[{\"name\":\"二级分类名\"}]}]}。请生成 5 到 10 个覆盖面适中的一级分类，每个一级分类生成 2 到 5 个具体二级分类；不要生成空的 children，不要生成泛泛的‘其他’。",
    `请为以下收藏标题设计一级和二级分类：\n${source}`,
  ) as { categories?: SuggestedCategory[] };
  const names = new Set<string>();
  const now = Date.now();
  for (const entry of (result.categories ?? []).slice(0, 10)) {
    const name = cleanName(entry.name);
    if (!name || names.has(name)) continue;
    names.add(name);
    const parent = { id: crypto.randomUUID(), name, parentId: null, sortOrder: now + createdCategories.length, createdAt: now };
    await db.insert(categories).values(parent);
    createdCategories.push(name);
    const childNames = new Set<string>();
    for (const childEntry of (entry.children ?? []).slice(0, 5)) {
      const childName = cleanName(childEntry.name);
      if (!childName || childNames.has(childName)) continue;
      childNames.add(childName);
      await db.insert(categories).values({ id: crypto.randomUUID(), name: childName, parentId: parent.id, sortOrder: now + createdCategories.length, createdAt: now });
      createdCategories.push(`${name} / ${childName}`);
    }
  }
}

async function createChildrenForExistingDirectory(db: ReturnType<typeof getDb>, directory: Array<{ id: string; name: string; parentId: string | null }>, items: OrganizeItem[], createdCategories: string[]) {
  const existingCategories = await db.select().from(categories);
  if (!directory.length || existingCategories.some((category) => category.parentId)) return;
  const source = items.slice(0, 180).map((item) => `- ${item.title.slice(0, 100)}`).join("\n");
  const result = await deepseekJson(
    "你是个人知识收藏整理助手。必须只输出有效 JSON，不要 Markdown。输出格式：{\"children\":[{\"parent\":\"现有一级分类名\",\"names\":[\"二级分类名\"]}]}。只能使用给出的一级分类名；每个一级分类生成 2 到 4 个具体二级分类；不要生成‘其他’。",
    `现有一级分类：${directory.map((category) => category.name).join("、")}\n收藏标题：\n${source}`,
  ) as { children?: Array<{ parent?: string; names?: string[] }> };
  const now = Date.now();
  for (const entry of result.children ?? []) {
    const parent = directory.find((category) => category.name === cleanName(entry.parent));
    if (!parent) continue;
    const names = new Set<string>();
    for (const rawName of (entry.names ?? []).slice(0, 4)) {
      const name = cleanName(rawName);
      if (!name || names.has(name)) continue;
      names.add(name);
      await db.insert(categories).values({ id: crypto.randomUUID(), name, parentId: parent.id, sortOrder: now, createdAt: now });
      createdCategories.push(`${parent.name} / ${name}`);
    }
  }
}

export async function POST() {
  try {
    if (!env.DEEPSEEK_API_KEY) return json({ error: "DeepSeek 未启用" }, { status: 503 });
    const db = getDb();
    const allItems = await db.select().from(savedItems).where(and(eq(savedItems.status, "inbox"), eq(savedItems.availability, "available")));
    const items = allItems.filter((item) => item.title.trim() && !/^(?:.+的)?收藏夹$/.test(item.title.trim()));
    if (!items.length) return json({ error: "待整理中没有可供初分的真实标题内容" }, { status: 400 });

    let directory = await db.select().from(categories).where(isNull(categories.parentId)).orderBy(asc(categories.sortOrder));
    const createdCategories: string[] = [];
    if (!directory.length) {
      await createHierarchy(db, items, createdCategories);
      directory = await db.select().from(categories).where(isNull(categories.parentId)).orderBy(asc(categories.sortOrder));
      if (!directory.length) return json({ error: "AI 没有生成可用的一级分类，请重试。" }, { status: 502 });
    } else {
      await createChildrenForExistingDirectory(db, directory, items, createdCategories);
    }

    let allCategories = await db.select().from(categories).orderBy(asc(categories.sortOrder));
    let fallback = allCategories.find((category) => category.name === "其他内容" && category.parentId === null);
    if (!fallback) {
      const now = Date.now();
      fallback = { id: crypto.randomUUID(), name: "其他内容", parentId: null, sortOrder: now, createdAt: now };
      await db.insert(categories).values(fallback);
      createdCategories.push("其他内容");
      allCategories = [...allCategories, fallback];
    }
    const categoryByCode = new Map(allCategories.map((category, index) => [`C${index + 1}`, category.id]));
    const directoryText = allCategories.map((category, index) => {
      const parent = category.parentId ? allCategories.find((candidate) => candidate.id === category.parentId) : null;
      return `C${index + 1}：${parent ? `${parent.name} / ` : ""}${category.name}`;
    }).join("\n");
    let classified = 0;
    for (let offset = 0; offset < items.length; offset += 40) {
      const batch = items.slice(offset, offset + 40);
      const source = batch.map((item) => `${item.id}\t${item.title.slice(0, 160)}\t${(item.excerpt ?? "").slice(0, 120)}`).join("\n");
      const result = await deepseekJson(
        "你是个人收藏整理助手。必须只输出有效 JSON，不要 Markdown。输出格式：{\"assignments\":[{\"itemId\":\"原ID\",\"categoryCode\":\"C1或null\",\"tags\":[\"中文标签\"],\"confidence\":0到100的整数}]}。每个输入条目必须恰好有一条 assignment；只从给出的目录编号 C1、C2…中选择；不确定时 categoryCode 为 null。",
        `目录：\n${directoryText}\n\n待分类条目（ID、标题、片段）：\n${source}`,
      ) as { assignments?: Assignment[] };
      const sourceIds = new Set(batch.map((item) => item.id));
      const assignments = new Map((result.assignments ?? []).filter((assignment) => assignment.itemId && sourceIds.has(assignment.itemId)).map((assignment) => [assignment.itemId as string, assignment]));
      for (const item of batch) {
        const assignment = assignments.get(item.id) ?? { itemId: item.id, categoryCode: null, tags: [], confidence: 0 };
        const categoryId = categoryByCode.get(String(assignment.categoryCode ?? "")) ?? null;
        const tags = (assignment.tags ?? []).map((tag) => String(tag).trim()).filter(Boolean).slice(0, 5);
        const confidence = Math.max(0, Math.min(100, Math.round(Number(assignment.confidence) || 0)));
        const finalCategoryId = categoryId ?? fallback.id;
        await db.delete(suggestions).where(eq(suggestions.itemId, item.id));
        await db.insert(suggestions).values({ id: crypto.randomUUID(), itemId: item.id, categoryId: finalCategoryId, tags: JSON.stringify(tags), confidence, createdAt: Date.now() });
        await db.update(savedItems).set({ status: "kept", categoryId: finalCategoryId, categorySource: "ai", tags: JSON.stringify(tags), updatedAt: Date.now() }).where(eq(savedItems.id, item.id));
        classified += 1;
      }
    }
    return json({ ok: true, createdCategories, classified, total: items.length, skipped: allItems.length - items.length });
  } catch (error) { return json({ error: errorMessage(error) }, { status: 500 }); }
}
