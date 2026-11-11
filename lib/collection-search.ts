type SearchItem = {
  id: string; title: string; status: string; excerpt?: string | null;
  author?: string | null; platform?: string; tags?: string; categoryId?: string | null;
};
type Term = { label: string; alternatives: string[]; weak: boolean; subject?: boolean };

// Small, explicit vocabulary, not model-generated claims about collection contents.
const concepts = [
  ["桌搭", "桌面布置", "书桌布置", "桌面搭配", "书桌搭配", "桌面改造", "书桌", "电脑桌"],
  ["穿搭", "服装搭配", "衣服搭配", "衣着搭配", "穿衣搭配"],
  ["通勤", "上班", "职场"],
  ["发型", "扎发", "编发", "头发造型"],
  ["美甲", "指甲彩绘", "甲油", "指甲油"],
  ["妆容", "化妆", "彩妆", "美妆"],
  ["护肤", "皮肤护理", "肌肤护理"],
  ["收纳", "储物", "置物"],
  ["健身", "锻炼", "运动训练"],
  ["阅读", "读书", "书单"],
  ["旅行", "旅游", "出游"],
  ["育儿", "养娃", "带娃"],
  ["人工智能", "ai"],
  ["小红书", "xiaohongshu", "xhs"],
  ["b站", "哔哩哔哩", "bilibili"],
  ["知乎", "zhihu"],
  ["微博", "weibo"],
];
const weakWords = new Set(["布置", "搭配", "设计", "整理", "方法", "教程", "参考", "推荐", "灵感", "攻略", "分享", "好看"]);
const stopWords = new Set(["我", "想", "找", "我想", "想要", "一下", "一些", "一个", "帮我", "请", "有关", "关于", "相关", "有没有", "如何", "怎么", "什么", "可以", "适合", "的", "了", "和", "与", "或", "是", "在", "内容", "笔记", "收藏", "视频", "the", "a", "of"]);
const segmenter = new Intl.Segmenter("zh-CN", { granularity: "word" });
const normalize = (value: string) => value.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
function contains(text: string, term: string) {
  return /^[a-z0-9]+$/.test(term) ? new RegExp(`(^|[^a-z0-9])${escape(term)}(?=$|[^a-z0-9])`).test(text) : text.includes(term);
}

export function searchTerms(query: string): Term[] {
  let remaining = normalize(query.slice(0, 200));
  const terms: Term[] = [];
  // Extract longest known expressions before language segmentation (e.g. 桌面布置).
  const aliases = concepts.flatMap((group, index) => group.map((alias) => ({ alias, index }))).sort((a, b) => b.alias.length - a.alias.length);
  const selected = new Set<number>();
  for (const { alias, index } of aliases) {
    if (!contains(remaining, alias)) continue;
    selected.add(index);
    const pattern = /^[a-z0-9]+$/.test(alias) ? `(^|[^a-z0-9])${escape(alias)}(?=$|[^a-z0-9])` : escape(alias);
    remaining = remaining.replace(new RegExp(pattern, "g"), " ");
  }
  for (const index of selected) terms.push({ label: concepts[index][0], alternatives: concepts[index], weak: false, subject: !["通勤", "小红书", "b站", "知乎", "微博"].includes(concepts[index][0]) });
  const tokens = [...segmenter.segment(remaining)].filter((part) => part.isWordLike).map((part) => part.segment);
  for (const token of new Set(tokens)) {
    if (stopWords.has(token)) continue;
    terms.push({ label: token, alternatives: [token], weak: weakWords.has(token) });
  }
  return terms;
}

export function searchCollections<T extends SearchItem>(items: T[], query: string, categoryPaths: Map<string, string>) {
  const phrase = normalize(query.slice(0, 200));
  if (!phrase) return [];
  const terms = searchTerms(query);
  const core = terms.filter((term) => !term.weak);
  const required = core.length ? core : terms;
  if (!required.length) return [];
  return items.filter((item) => item.status !== "trash").flatMap((item) => {
    const fields = [
      [item.title, 10], [item.tags, 7], [item.excerpt, 5],
      [categoryPaths.get(item.categoryId || ""), 3], [item.author, 3], [item.platform, 2],
    ].map(([value, weight]) => ({ text: normalize(String(value || "")), weight: Number(weight) }));
    const matches = terms.map((term) => ({ term, score: Math.max(0, ...fields.map((field) => term.alternatives.some((word) => contains(field.text, word)) ? field.weight : 0)) }));
    const exact = fields.some((field) => contains(field.text, phrase));
    const matchedCore = matches.filter((match) => required.includes(match.term) && match.score > 0).length;
    if (!exact && terms.some((term) => term.subject) && !matches.some((match) => match.term.subject && match.score > 0)) return [];
    // Generic modifiers alone (e.g. 布置 in 美甲布置) must not match 桌搭布置.
    if (!exact && matchedCore < Math.ceil(required.length / 2)) return [];
    const coverage = matchedCore / required.length;
    const score = (exact ? 100 : 0) + coverage * 30 + matches.reduce((sum, match) => sum + match.score * (match.term.weak ? .2 : 1), 0);
    return [{ item, score, matchedTerms: matches.filter((match) => match.score > 0).map((match) => match.term.label), exact }];
  }).sort((a, b) => b.score - a.score || a.item.id.localeCompare(b.item.id));
}
