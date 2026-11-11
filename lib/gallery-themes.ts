export type GalleryCategory = { id: string; name: string; parentId: string | null };
export type UniverseKey = "beauty" | "health" | "ai" | "growth" | "travel" | "lifestyle" | "other";
export type UniverseTheme = { key: UniverseKey; label: string; asset: string; matcher: RegExp; fallbackChildren: string[] };

// Presentation groups only. Existing directory IDs and saved-item ownership stay intact.
export const themes: UniverseTheme[] = [
  { key: "beauty", label: "我想变美", asset: "/art/beauty.png", matcher: /美妆|穿搭|妆容|护肤|美甲|我想变美/i, fallbackChildren: ["发型参考", "美妆护肤", "穿搭参考", "美甲参考"] },
  { key: "health", label: "我想健康", asset: "/art/health-ponytail-v2.png", matcher: /养生|健康|运动|身心/i, fallbackChildren: ["运动练习", "饮食营养", "睡眠修复", "身心健康"] },
  { key: "ai", label: "我想搞钱", asset: "/art/earning-workspace-v2.png", matcher: /AI|人工智能|内容创作|内容制作|自媒体|视频剪辑|效率工具|我想搞钱/i, fallbackChildren: ["AI 工具", "内容灵感", "表达与写作", "创作工作流"] },
  { key: "growth", label: "我想学会", asset: "/art/growth.png", matcher: /自我|阅读|知识|个人成长|心理|育儿|亲子|儿童|孩子|我想学会/i, fallbackChildren: ["自我成长", "育儿成长"] },
  { key: "travel", label: "我想看世界", asset: "/art/travel.png", matcher: /旅行|探索|出行|目的地|我想看世界/i, fallbackChildren: ["目的地", "行程攻略", "旅行灵感", "装备清单"] },
  { key: "lifestyle", label: "提升生活品质", asset: "/art/lifestyle.png", matcher: /生活|家居|日常/i, fallbackChildren: ["居住美学", "日常好物", "家居灵感", "生活记录"] },
  { key: "other", label: "其他", asset: "/art/other.png", matcher: /其他|未分类|杂项/i, fallbackChildren: ["有趣发现", "灵感碎片"] },
];

export const learningGroups = [
  { key: "self", label: "自我成长", matcher: /自我|阅读|知识|个人成长|心理/i },
  { key: "parenting", label: "育儿成长", matcher: /育儿|亲子|儿童|孩子/i },
] as const;

export function learningChildren(categories: GalleryCategory[]) {
  const roots = new Set(categories.filter((category) => !category.parentId && learningGroups[0].matcher.test(category.name)).map((category) => category.id));
  const children: { label: string; id: string | null; group?: "self" | "parenting" }[] = categories.filter((category) => category.parentId && roots.has(category.parentId)).map((category) => ({ label: category.name, id: category.id }));
  if (!children.length) children.push({ label: "自我成长", id: null, group: "self" });
  children.push({ label: "育儿成长", id: null, group: "parenting" });
  return children;
}

export function directoryScope(categories: GalleryCategory[], matcher: RegExp) {
  const ids = new Set(categories.filter((category) => !category.parentId && matcher.test(category.name)).map((category) => category.id));
  let previousSize = -1;
  while (previousSize !== ids.size) {
    previousSize = ids.size;
    categories.forEach((category) => { if (category.parentId && ids.has(category.parentId)) ids.add(category.id); });
  }
  return ids;
}
