const test = require("node:test");
const assert = require("node:assert/strict");
const { ITEMS, CATEGORIES } = require("../js/data.js");
const { dayIndex, pickItem, buildMessage } = require("../scripts/facebook-post.js");

test("日付は日本時間で切り替わる", () => {
  // 2026-10-11 23:59 JST と 2026-10-12 00:00 JST
  const a = new Date("2026-10-11T23:59:00+09:00");
  const b = new Date("2026-10-12T00:00:00+09:00");
  assert.equal(dayIndex(b) - dayIndex(a), 1);
});

test("連続する日付で全項目を一巡する", () => {
  const start = new Date("2026-10-11T12:00:00+09:00");
  const names = new Set();
  for (let i = 0; i < ITEMS.length; i++) {
    names.add(pickItem(new Date(start.getTime() + i * 86400000)).name);
  }
  assert.equal(names.size, ITEMS.length);
});

test("全項目の投稿本文に名前・区分・説明が入り、Facebookの上限内", () => {
  for (const item of ITEMS) {
    const msg = buildMessage(item, "https://example.com/");
    assert.ok(msg.includes(item.name), item.name);
    assert.ok(msg.includes(CATEGORIES[item.cat].label), item.name);
    assert.ok(msg.includes(item.desc), item.name);
    assert.ok(msg.includes("https://example.com/"), item.name);
    assert.ok(msg.length < 60000, `${item.name}: 本文が長すぎる`);
  }
});

test("SITE_URL がなければリンクを入れない", () => {
  assert.doesNotMatch(buildMessage(ITEMS[0], ""), /https?:/);
});
