import assert from "node:assert/strict";
import { themes, learningGroups, learningChildren, directoryScope } from "../lib/gallery-themes.ts";
assert.deepEqual(themes.map(t=>t.label), ["我想变美","我想健康","我想搞钱","我想学会","我想看世界","提升生活品质","其他"]);
const categories = [
  { id:"self", name:"个人成长与心理", parentId:null },
  { id:"reading", name:"阅读", parentId:"self" },
  { id:"child", name:"育儿早教", parentId:null },
  { id:"early", name:"早教", parentId:"child" },
  { id:"ai", name:"AI学习", parentId:null },
  { id:"video", name:"视频剪辑与自媒体", parentId:null },
  { id:"other", name:"其他内容", parentId:null },
];
const learning=directoryScope(categories,themes.find(t=>t.key==="growth").matcher);
assert.deepEqual([...learning].sort(),["self","reading","child","early"].sort());
assert.deepEqual([...directoryScope(categories,learningGroups[0].matcher)].sort(),["self","reading"].sort());
assert.deepEqual([...directoryScope(categories,learningGroups[1].matcher)].sort(),["child","early"].sort());
assert.deepEqual([...directoryScope(categories,themes.find(t=>t.key==="ai").matcher)].sort(),["ai","video"].sort());
assert.equal(categories.length,7);
assert.deepEqual(learningChildren(categories),[{label:"阅读",id:"reading"},{label:"育儿成长",id:null,group:"parenting"}]);
assert.ok(directoryScope(categories,themes.find(t=>t.key==="other").matcher).has("other"));
assert.deepEqual(themes.find(t=>t.key==="other").fallbackChildren, ["有趣发现", "灵感碎片"]);
console.log("PASS: seven ordered themes, original growth children restored, parenting preserved, distinct scopes, no directory mutation.");
