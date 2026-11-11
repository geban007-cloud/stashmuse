export type ContextItem = {
  id: string;
  url: string;
  title: string;
  platform: string;
  excerpt?: string | null;
  coverUrl?: string | null;
};

export type PublicContext = {
  text: string;
  pageTitle: string;
  description: string;
  blocked: boolean;
};

const blockedMarkers = /Sina Visitor System|访客验证|安全验证|访问频繁|验证码|登录后查看/i;

export function isUnavailableExcerpt(value?: string | null) {
  const text = value?.trim() || "";
  return !text || /正文暂时无法读取|暂时没有文字摘要|打开原文查看/i.test(text);
}

function decodeEntities(value: string) {
  return value.replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&quot;/gi, '"').replace(/&#39;/gi, "'").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">");
}

function stripMarkup(value: string) {
  return decodeEntities(value.replace(/<!--[\s\S]*?-->/g, " ").replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<noscript[\s\S]*?<\/noscript>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\\u[0-9a-f]{4}/gi, " ").replace(/\s+/g, " ").trim());
}

function meta(html: string, key: string) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']*)["'][^>]*>`, "i");
  const reverse = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${escaped}["'][^>]*>`, "i");
  return decodeEntities(pattern.exec(html)?.[1] || reverse.exec(html)?.[1] || "").replace(/\s+/g, " ").trim();
}

export async function readPublicContext(item: ContextItem): Promise<PublicContext> {
  try {
    const response = await fetch(item.url, { headers: { "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Safari/537.36", accept: "text/html,application/xhtml+xml" }, signal: AbortSignal.timeout(9000) });
    const html = await response.text();
    const pageTitle = meta(html, "og:title") || /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]?.trim() || "";
    const description = meta(html, "og:description") || meta(html, "description") || meta(html, "twitter:description");
    const text = [description, stripMarkup(html)].filter(Boolean).join(" ").replace(/\s+/g, " ").trim().slice(0, 12000);
    const blocked = blockedMarkers.test(html) || text.length < 30;
    return { text: blocked ? "" : text, pageTitle, description, blocked };
  } catch {
    return { text: "", pageTitle: "", description: "", blocked: true };
  }
}

export function looksLikeTimestampTitle(title: string) {
  const normalized = title.trim();
  return /^(?:昨天|今天|前天)?\s*\d{1,2}[-/:]\d{1,2}(?:\s+\d{1,2}:\d{2})?$/.test(normalized)
    || /^\d{1,2}:\d{2}$/.test(normalized)
    || /^微博内容\s*[·-]\s*\d{1,2}[-/:]\d{1,2}/.test(normalized);
}
