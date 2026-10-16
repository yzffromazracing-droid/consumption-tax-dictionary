const test = require("node:test");
const assert = require("node:assert/strict");
const { FETCHED_AT, SOURCES, TYPES, ENTRIES } = require("../js/kani.js");
const { KANI_TYPES } = require("../js/data.js");
const { searchKani } = require("../js/search.js");

test("取得日・出典がある", () => {
  assert.match(FETCHED_AT, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(SOURCES.length >= 9);
  for (const s of SOURCES) {
    assert.ok(s.title, `${s.url}: タイトルが空`);
    assert.match(s.url, /^https:\/\/www\.nta\.go\.jp\//);
  }
});

test("第1種〜第6種すべてに定義と具体例がある", () => {
  for (let n = 1; n <= 6; n++) {
    assert.ok(KANI_TYPES[n], `KANI_TYPES に第${n}種がない`);
    assert.ok(TYPES[n] && TYPES[n].def, `第${n}種の定義がない`);
    assert.ok(ENTRIES.some((e) => e.t.includes(n)), `第${n}種の項目がない`);
  }
});

test("各項目の形式が正しい", () => {
  for (const e of ENTRIES) {
    assert.ok(["i", "n", "e", "c"].includes(e.k), `種類が不正: ${JSON.stringify(e)}`);
    assert.ok(e.t.length && e.t.every((n) => n >= 1 && n <= 6), `区分が不正: ${JSON.stringify(e)}`);
    assert.ok(SOURCES[e.src], `出典がない: ${JSON.stringify(e)}`);
    if (e.k === "i") {
      assert.ok(e.maj && e.mid && e.min.length, `業種名がない: ${JSON.stringify(e)}`);
    } else {
      assert.ok(e.text, `本文がない: ${JSON.stringify(e)}`);
    }
  }
});

test("業種・取引から期待した事業区分が最上位に来る", () => {
  const cases = [
    ["植木の剪定", 4],
    ["タクシー", 5],
    ["不動産仲介", 6],
    ["駐車場", 6],
    ["喫茶店", 4],
    ["建設業", 3],
    ["ソフトウェア", 5],
    ["プロスポーツ", 5],
  ];
  for (const [q, type] of cases) {
    const [top] = searchKani(ENTRIES, q);
    assert.ok(top, `${q}: ヒットなし`);
    assert.ok(top.t.includes(type), `${q}: 第${top.t.join("・")}種（期待は第${type}種）`);
  }
});

test("事業区分で絞り込める", () => {
  const r = searchKani(ENTRIES, "", { type: "6" });
  assert.ok(r.length > 0);
  assert.ok(r.every((e) => e.t.includes(6)));
});

test("ひらがな・カタカナどちらでも検索できる", () => {
  assert.deepEqual(searchKani(ENTRIES, "くりーにんぐ"), searchKani(ENTRIES, "クリーニング"));
  assert.ok(searchKani(ENTRIES, "クリーニング").length > 0);
});

test("農林水産業の飲食料品の譲渡は第2種として出てくる", () => {
  const farming = ENTRIES.filter((e) => e.k === "i" && /^[AB]－/.test(e.maj) && e.t.includes(3));
  assert.ok(farming.length > 0);
  assert.ok(farming.every((e) => e.food && e.t.includes(2)), "農林水産業の業種が第2種を含まない");
  assert.ok(ENTRIES.some((e) => e.k === "n" && e.t.includes(2) && /飲食料品/.test(e.text) && /農林水産業/.test(e.text)));
  const r = searchKani(ENTRIES, "耕種農業", { type: "2" });
  assert.ok(r.length > 0, "第2種で絞り込むと耕種農業が出ない");
});
