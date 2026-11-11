import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { settings } from "@/db/schema";
import { errorMessage, json } from "@/lib/http";

export async function POST() {
  try {
    const token = crypto.randomUUID(); const db = getDb();
    await db.delete(settings).where(eq(settings.key, "extension_token"));
    await db.insert(settings).values({ key: "extension_token", value: token, updatedAt: Date.now() });
    return json({ token });
  } catch (error) { return json({ error: errorMessage(error) }, { status: 500 }); }
}
