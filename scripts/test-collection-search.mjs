import assert from "node:assert/strict";
import { searchCollections } from "../lib/collection-search.ts";
const items = [
  { id: "desk", title: "我的桌搭分享", status: "kept" },
  { id: "exact", title: "桌搭布置清单", status: "kept" },
  { id: "synonym", title: "小书桌也可以很舒服", status: "later" },
  { id: "body", title: "我的工作角落", excerpt: "书桌布置的一点心得", status: "inbox" },
  { id: "unrelated", title: "婚礼布置灵感", status: "kept" },
  { id: "trash", title: "桌搭布置", status: "trash" },
  { id: "outfit", title: "通勤服装搭配", status: "kept" },
  { id: "not-outfit", title: "不上班每天在家干嘛", status: "kept" },
  { id: "english", title: "Daily notes", status: "kept" },
  { id: "ai", title: "AI 工具", status: "kept" },
  { id: "tag", title: "收藏 A", tags: '["旅行"]', status: "kept" },
  { id: "category", title: "收藏 B", categoryId: "reading", status: "kept" },
  { id: "platform", title: "收藏 C", platform: "bilibili", status: "kept" },
];
const paths = new Map([["reading", "自我成长 / 阅读"]]);
const search = query => searchCollections(items, query, paths).map(hit => hit.item.id);
for (const query of ["桌搭布置", "桌搭 布置", "桌面布置", "我想找一些桌搭布置的灵感"]) {
  const result = search(query);
  for (const id of ["desk", "exact", "synonym", "body"]) assert.ok(result.includes(id), `${query}: missing ${id}`);
  assert.ok(!result.includes("unrelated"));
  assert.ok(!result.includes("trash"));
}
assert.equal(search("桌搭布置")[0], "exact");
assert.ok(search("上班穿搭").includes("outfit"));
assert.ok(!search("上班穿搭").includes("not-outfit"));
assert.deepEqual(search("ＡＩ"), ["ai"]);
assert.ok(search("旅游攻略").includes("tag"));
assert.ok(search("读书推荐").includes("category"));
assert.ok(search("B站").includes("platform"));
assert.deepEqual(search(""), []);
assert.deepEqual(search("？！！"), []);
assert.deepEqual(search("量子引力"), []);
console.log("PASS: Chinese segmentation, synonyms, ranking, irrelevant/trash exclusion, metadata search, Latin boundaries and empty queries.");
