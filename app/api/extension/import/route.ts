import { eq } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { getDb } from "@/db";
import { settings } from "@/db/schema";
import { errorMessage, json } from "@/lib/http";

export async function POST(request: Request) {
  try {
    const token = request.headers.get("x-collection-token");
    const saved = await getDb().select().from(settings).where(eq(settings.key, "extension_token")).limit(1);
    if (!token || token !== saved[0]?.value) return json({ error: "扩展未配对" }, { status: 401 });
    const body = await request.json();
    const itemsRoute = await import("@/app/api/items/route");
    const importResponse = await itemsRoute.POST(new Request(new URL("/api/items", request.url), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));
    if (!importResponse.ok) return importResponse;
    const importPayload = await importResponse.json() as { created?: string[]; updated?: string[]; skipped?: number };
    if (!env.DEEPSEEK_API_KEY || !importPayload.created?.length) return json(importPayload, { status: importResponse.status });

    // New imports are organized immediately so the extension workflow does not
    // leave a second manual classification step for the user.
    const organizeRoute = await import("@/app/api/onboarding/organize/route");
    const organizeResponse = await organizeRoute.POST();
    if (!organizeResponse.ok) return json({ ...importPayload, autoOrganized: false }, { status: importResponse.status });
    const organization = await organizeResponse.json();
    return json({ ...importPayload, autoOrganized: true, organization }, { status: importResponse.status });
  } catch (error) { return json({ error: errorMessage(error) }, { status: 500 }); }
}
