const test = require("node:test");
const assert = require("node:assert/strict");
const { ITEMS } = require("../js/data.js");
const { normalize, search } = require("../js/search.js");

test("normalize はカタカナ・全角を揃える", () => {
  assert.equal(normalize("ＥＴＣ"), "etc");
  assert.equal(normalize("テイクアウト"), normalize("ていくあうと"));
});

test("ひらがな・カタカナどちらでも検索できる", () => {
  const a = search(ITEMS, "ちゅうしゃじょう").map((i) => i.name);
  const b = search(ITEMS, "チュウシャジョウ").map((i) => i.name);
  assert.ok(a.length > 0);
  assert.deepEqual(a, b);
});

test("代表的な語が期待した区分で最上位に来る", () => {
  const cases = [
    ["収入印紙", "hi"],
    ["給与", "fu"],
    ["輸出", "men"],
    ["テイクアウト", "k8"],
    ["酒類", "k10"],
  ];
  for (const [q, cat] of cases) {
    const [top] = search(ITEMS, q);
    assert.ok(top, `${q}: ヒットなし`);
    assert.equal(top.cat, cat, `${q}: ${top.name} (${top.cat})`);
  }
});

test("複数語は AND 検索", () => {
  const results = search(ITEMS, "住宅 礼金");
  assert.ok(results.length > 0);
  assert.equal(results[0].cat, "hi");
});

test("区分・勘定科目で絞り込める", () => {
  assert.ok(search(ITEMS, "", { cat: "men" }).every((i) => i.cat === "men"));
  const byAccount = search(ITEMS, "", { account: "法定福利費" });
  assert.ok(byAccount.length > 0);
  assert.ok(byAccount.every((i) => i.accounts.includes("法定福利費")));
});

test("空クエリは全件を元の順序で返す", () => {
  assert.deepEqual(search(ITEMS, ""), ITEMS);
});

test("社会保険料は会社負担分が非課税、従業員からの預り分が不課税", () => {
  const company = search(ITEMS, "社会保険料 会社負担");
  assert.equal(company[0].cat, "hi");
  assert.ok(company[0].accounts.includes("法定福利費"));
  const employee = search(ITEMS, "社会保険料 従業員負担");
  assert.equal(employee[0].cat, "fu");
  assert.ok(employee[0].accounts.includes("預り金"));
  // 法定福利費の項目はすべて非課税
  assert.ok(search(ITEMS, "", { account: "法定福利費" }).every((i) => i.cat === "hi"));
});

test("具体例の語でも検索できる", () => {
  const [top] = search(ITEMS, "小作料");
  assert.ok(top, "ヒットなし");
  assert.equal(top.name, "土地の貸付け（地代）");
});

test("課税項目の具体例でも検索できる", () => {
  assert.equal(search(ITEMS, "ロッカー使用料")[0].name, "接待ゴルフ（プレー代）");
  assert.equal(search(ITEMS, "食玩")[0].cat, "k8");
});

test("不課税・免税項目の具体例でも検索できる", () => {
  assert.equal(search(ITEMS, "お賽銭")[0].cat, "fu");
  assert.equal(search(ITEMS, "腕時計の修理")[0].cat, "men");
});

test("助詞・送りがなで区切って内容語にする", () => {
  const { relaxTerms } = require("../js/search.js");
  assert.deepEqual(relaxTerms("自動車の修理"), ["自動車", "修理"]);
  assert.deepEqual(relaxTerms("駐車場を貸す"), ["駐車場", "貸"]);
  assert.deepEqual(relaxTerms("パンを作って売る"), [normalize("パン"), "作", "売"]);
  assert.deepEqual(relaxTerms("ちゅうしゃじょう"), ["ちゅうしゃじょう"]);
});

test("言い方を変えても見つかる（辞書）", () => {
  const cases = [
    ["自動車の修理", "車検・修理・整備費用"],
    ["不動産の仲介", "不動産仲介手数料"],
    ["家賃の支払い", "事務所・店舗の家賃"],
    ["社員の給料", "給与・賞与・役員報酬"],
    ["海外への輸出", "輸出売上（商品の輸出）"],
    ["印紙を買う", "収入印紙・証紙の購入"],
  ];
  for (const [q, name] of cases) {
    const r = search(ITEMS, q);
    assert.ok(r.approx, `${q}: 近い結果の印がない`);
    assert.equal(r[0] && r[0].name, name, `${q}: ${r.slice(0, 3).map((i) => i.name).join("、")}`);
  }
});

test("そのままの言葉で見つかるときは近い結果の印を付けない", () => {
  const r = search(ITEMS, "収入印紙");
  assert.ok(r.length > 0);
  assert.ok(!r.approx);
});

test("言い方を変えても見つかる（簡易課税・国税庁の記事）", () => {
  const { ENTRIES } = require("../js/kani.js");
  const { ARTICLES } = require("../js/nta.js");
  const { searchKani, searchArticles } = require("../js/search.js");
  const [k] = searchKani(ENTRIES, "不動産の仲介");
  assert.ok(k && k.t.includes(6), "不動産の仲介が第6種にならない");
  const [d] = searchKani(ENTRIES, "駐車場を貸す");
  assert.ok(d && d.t.includes(6), "駐車場を貸すが第6種にならない");
  const [a] = searchArticles(ARTICLES, "簡易課税の届出");
  assert.ok(a && /簡易課税制度選択届出書/.test(a.title), "簡易課税の届出で届出書の記事が出ない");
});
