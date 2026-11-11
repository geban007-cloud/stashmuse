import assert from "node:assert/strict";
import { safeCoverUrl, selectVisualSources } from "../lib/outfit.ts";

for (const url of ["http://127.0.0.1/a", "http://localhost/a", "file:///tmp/a", "https://xhscdn.com.evil.test/a", "https://user:secret@sns-webpic-qc.xhscdn.com/a", "https://sns-webpic-qc.xhscdn.com:8888/a", "data:image/png;base64,a", null]) {
  assert.equal(safeCoverUrl(url), null);
}
assert.ok(safeCoverUrl("https://sns-webpic-qc.xhscdn.com/test.webp"));
assert.ok(safeCoverUrl("https://i0.hdslb.com/test.jpg"));
const sources = Array.from({ length: 20 }, (_, i) => ({ id: `id-${i}`, title: i === 7 ? "蓝白通勤" : `收藏${i}`, category: ["发型参考", "美妆护肤", "穿搭参考", "美甲参考"][i % 4], excerpt: "", coverUrl: "https://sns-webpic-qc.xhscdn.com/test.webp" }));
const selected = selectVisualSources(sources, "蓝白通勤");
assert.equal(selected.length, 8);
assert.equal(new Set(selected.map((item) => item.id)).size, 8);
assert.equal(new Set(selected.map((item) => item.category)).size, 4);
assert.ok(selected.some((item) => item.id === "id-7"));
assert.deepEqual(selectVisualSources([...sources].reverse(), "蓝白通勤"), selected);
assert.deepEqual(selectVisualSources([{ ...sources[0], coverUrl: "http://localhost/a" }], ""), []);
assert.deepEqual(selectVisualSources([], ""), []);
assert.equal(selectVisualSources(sources, "", 1).length, 1);
console.log("PASS: cover URL restrictions, selection limit, deduplication, area coverage, relevance and deterministic ordering.");
