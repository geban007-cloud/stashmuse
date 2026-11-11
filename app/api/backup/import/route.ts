import { getDb } from "@/db";
import { actionPlans, categories, digests, retentionEvents, savedItems, suggestions } from "@/db/schema";
import { errorMessage, json } from "@/lib/http";

type Backup = { version?: number; categories?: unknown[]; savedItems?: unknown[]; suggestions?: unknown[]; digests?: unknown[]; retentionEvents?: unknown[]; actionPlans?: unknown[] };

/** Imports a versioned local backup. `replace` rewrites collection data but deliberately keeps pairing/settings secrets. */
export async function POST(request: Request) {
  try {
    const { backup, mode = "merge" } = (await request.json()) as { backup?: Backup; mode?: "merge" | "replace" };
    if (!backup || backup.version !== 1 || !Array.isArray(backup.categories) || !Array.isArray(backup.savedItems)) {
      return json({ error: "不是可识别的「不怕吃灰」收藏夹 v1 备份文件" }, { status: 400 });
    }
    const db = getDb();
    if (mode === "replace") {
      await db.delete(actionPlans); await db.delete(retentionEvents); await db.delete(suggestions); await db.delete(digests); await db.delete(savedItems); await db.delete(categories);
    }
    const importRows = async (table: typeof categories | typeof savedItems | typeof suggestions | typeof digests | typeof retentionEvents | typeof actionPlans, rows: unknown[]) => {
      for (const row of rows) await db.insert(table).values(row as never).onConflictDoNothing();
    };
    await importRows(categories, backup.categories);
    await importRows(savedItems, backup.savedItems);
    await importRows(suggestions, backup.suggestions ?? []);
    await importRows(digests, backup.digests ?? []);
    await importRows(retentionEvents, backup.retentionEvents ?? []);
    await importRows(actionPlans, backup.actionPlans ?? []);
    return json({ ok: true, mode, imported: { categories: backup.categories.length, savedItems: backup.savedItems.length } });
  } catch (error) { return json({ error: errorMessage(error) }, { status: 500 }); }
}
