const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");

test("すべてのタブに対応するパネルがある", () => {
  const tabs = [...html.matchAll(/data-tab="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(tabs.length >= 9);
  for (const t of tabs) assert.ok(html.includes(`id="tab-${t}"`), `パネル tab-${t} がない`);
  assert.equal(new Set(tabs).size, tabs.length, "タブが重複している");
});

test("税率引下げタブは辞書の右にあり、目次のリンク先がある", () => {
  const tabs = [...html.matchAll(/data-tab="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(tabs.indexOf("ratecut"), tabs.indexOf("dict") + 1);
  const panel = html.slice(html.indexOf('id="tab-ratecut"'), html.indexOf("<!-- 判定フロー -->"));
  for (const m of panel.matchAll(/href="#([^"]+)"/g)) assert.ok(panel.includes(`id="${m[1]}"`), `#${m[1]} がない`);
});
