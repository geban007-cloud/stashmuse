import { eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { savedItems, suggestions } from "@/db/schema";
import { errorMessage, json } from "@/lib/http";

/** Permanently clears only records the user has already moved to the recycle bin. */
export async function DELETE() {
  try {
    const db = getDb();
    const trashed = await db.select({ id: savedItems.id }).from(savedItems).where(eq(savedItems.status, "trash"));
    const ids = trashed.map((item) => item.id);
    if (ids.length) {
      await db.delete(suggestions).where(inArray(suggestions.itemId, ids));
      await db.delete(savedItems).where(inArray(savedItems.id, ids));
    }
    return json({ deleted: ids.length });
  } catch (error) { return json({ error: errorMessage(error) }, { status: 500 }); }
}
