import { getDb } from "@/db";
import { actionPlans, categories, digests, retentionEvents, savedItems, suggestions } from "@/db/schema";
import { errorMessage, json } from "@/lib/http";

export async function GET() {
  try {
    const db = getDb();
    return json({ version: 1, exportedAt: new Date().toISOString(), categories: await db.select().from(categories), savedItems: await db.select().from(savedItems), suggestions: await db.select().from(suggestions), digests: await db.select().from(digests), retentionEvents: await db.select().from(retentionEvents), actionPlans: await db.select().from(actionPlans) });
  } catch (error) { return json({ error: errorMessage(error) }, { status: 500 }); }
}
