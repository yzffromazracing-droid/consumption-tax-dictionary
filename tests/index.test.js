const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");

const navTabs = (cls) =>
  [...html.matchAll(new RegExp('class="' + cls + '(?: is-active)?"[^>]*data-tab="([^"]+)"', "g"))].map((m) => m[1]);

test("すべてのタブに対応するパネルがある", () => {
  const top = navTabs("tab");
  const sub = navTabs("subtab");
  assert.deepEqual(top, ["dict", "tsu", "nta", "cfa", "inv"]);
  assert.deepEqual(sub, ["dict", "ratecut", "flow", "guide", "kani"]);
  for (const t of top.concat(sub)) assert.ok(html.includes(`id="tab-${t}"`), `パネル tab-${t} がない`);
  const panels = [...html.matchAll(/id="tab-([^"]+)"[^>]*role="tabpanel"/g)].map((m) => m[1]);
  for (const p of panels) assert.ok(top.includes(p) || sub.includes(p), `パネル tab-${p} を開くタブがない`);
});

test("税率引下げは辞書の下のメニューにあり、目次のリンク先がある", () => {
  const sub = navTabs("subtab");
  assert.equal(sub.indexOf("ratecut"), sub.indexOf("dict") + 1);
  const panel = html.slice(html.indexOf('id="tab-ratecut"'), html.indexOf("<!-- 判定フロー -->"));
  for (const m of panel.matchAll(/href="#([^"]+)"/g)) assert.ok(panel.includes(`id="${m[1]}"`), `#${m[1]} がない`);
});

test("画面のスクリプトに構文エラーがない", () => {
  const vm = require("node:vm");
  for (const f of ["js/app.js", "js/search.js", "js/data.js"]) {
    const src = fs.readFileSync(path.join(__dirname, "..", f), "utf8");
    assert.doesNotThrow(() => new vm.Script(src, { filename: f }), `${f} に構文エラー`);
  }
});
