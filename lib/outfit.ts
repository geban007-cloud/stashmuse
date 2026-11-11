/** Only public image CDNs from supported import platforms may be sent to vision. */
export function safeCoverUrl(value: string | null | undefined): string | null {
  if (!value || value.length > 8192) return null;
  try {
    const url = new URL(value);
    const domains = ["xhscdn.com", "hdslb.com", "zhimg.com", "sinaimg.cn"];
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || url.port) return null;
    if (!domains.some((domain) => url.hostname === domain || url.hostname.endsWith(`.${domain}`))) return null;
    return url.href;
  } catch { return null; }
}

export type OutfitSource = { id: string; title: string; category: string; excerpt: string; coverUrl: string | null };

function area(source: OutfitSource) {
  const text = `${source.category.split(" / ").at(-1)} ${source.title}`;
  if (/美甲|指甲|甲油/.test(text)) return 3;
  if (/发型|头发|扎发|编发|短发/.test(text)) return 0;
  if (/美妆|护肤|妆容|化妆|口红/.test(text)) return 1;
  return 2;
}

/** Bounded, deterministic selection, rotating across areas so clothes don't take every slot. */
export function selectVisualSources(sources: OutfitSource[], conditions: string, limit = 8) {
  const terms = [...new Set(conditions.toLowerCase().match(/[a-z0-9]+|[\u4e00-\u9fff]{2}/g) || [])];
  const score = (item: OutfitSource) => terms.reduce((n, term) => n + Number(`${item.title} ${item.category} ${item.excerpt}`.toLowerCase().includes(term)), 0);
  const sorted = sources.filter((item) => safeCoverUrl(item.coverUrl)).sort((a, b) => score(b) - score(a) || a.id.localeCompare(b.id));
  const buckets = [0, 1, 2, 3].map((index) => sorted.filter((item) => area(item) === index));
  const selected: OutfitSource[] = [];
  while (selected.length < limit && buckets.some((bucket) => bucket.length)) {
    for (const bucket of buckets) {
      if (selected.length === limit) break;
      const item = bucket.shift();
      if (item) selected.push(item);
    }
  }
  return selected;
}
