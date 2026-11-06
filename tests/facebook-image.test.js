const test = require("node:test");
const assert = require("node:assert/strict");
const { ITEMS, CATEGORIES } = require("../js/data.js");
const { buildSvg, wrap } = require("../scripts/facebook-image.js");

test("全項目の図解カードに名前の先頭と区分が入る", () => {
  for (const item of ITEMS) {
    const svg = buildSvg(item);
    assert.match(svg, /^<svg [^>]*width="1080" height="1080"/, item.name);
    assert.ok(svg.includes(Array.from(item.name).slice(0, 6).join("").replace(/&/g, "&amp;")), item.name);
    assert.ok(svg.includes(CATEGORIES[item.cat].label), item.name);
    assert.doesNotMatch(svg, /undefined|NaN/, item.name);
  }
});

test("折り返しは指定の行数に収まり、超えたら…で切る", () => {
  assert.deepEqual(wrap("あいうえお", 3, 2), ["あいう", "えお"]);
  assert.deepEqual(wrap("あいうえおかきく", 3, 2), ["あいう", "えお…"]);
  assert.deepEqual(wrap("あい、う", 2, 3), ["あい、", "う"]);
});

test("軽減8%のカードにだけ税率引下げの予定を入れる", () => {
  for (const item of ITEMS) {
    const svg = buildSvg(item);
    if (item.cat !== "k8") assert.doesNotMatch(svg, /引下げ/, item.name);
    else if (item.name.includes("新聞")) assert.match(svg, /税率引下げ後も8%のまま/, item.name);
    else assert.match(svg, /2027年4月〜 1%に引下げ予定/, item.name);
  }
});
