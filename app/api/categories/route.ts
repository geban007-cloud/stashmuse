import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { categories } from "@/db/schema";
import { errorMessage, json } from "@/lib/http";

export async function GET() {
  try {
    const rows = await getDb().select().from(categories).orderBy(asc(categories.sortOrder), asc(categories.createdAt));
    return json({ categories: rows });
  } catch (error) {
    return json({ error: errorMessage(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { name?: string; parentId?: string | null };
    const name = body.name?.trim();
    if (!name) return json({ error: "请填写分类名称" }, { status: 400 });
    const now = Date.now();
    const category = { id: crypto.randomUUID(), name, parentId: body.parentId ?? null, sortOrder: now, createdAt: now };
    await getDb().insert(categories).values(category);
    return json({ category }, { status: 201 });
  } catch (error) {
    return json({ error: errorMessage(error) }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = (await request.json()) as { id?: string; name?: string; parentId?: string | null; sortOrder?: number };
    if (!body.id) return json({ error: "缺少分类 ID" }, { status: 400 });
    if (body.parentId === body.id) return json({ error: "分类不能归入自己" }, { status: 400 });
    const patch: { name?: string; parentId?: string | null; sortOrder?: number } = {};
    if (body.name !== undefined) {
      if (!body.name.trim()) return json({ error: "分类名称不能为空" }, { status: 400 });
      patch.name = body.name.trim();
    }
    if (body.parentId !== undefined) patch.parentId = body.parentId;
    if (typeof body.sortOrder === "number") patch.sortOrder = body.sortOrder;
    if (!Object.keys(patch).length) return json({ error: "没有可更新的分类信息" }, { status: 400 });
    await getDb().update(categories).set(patch).where(eq(categories.id, body.id));
    return json({ ok: true });
  } catch (error) {
    return json({ error: errorMessage(error) }, { status: 500 });
  }
}
