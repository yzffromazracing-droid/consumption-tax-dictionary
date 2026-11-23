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

test("SITE_URL がなければ公開ページのアドレスを入れない（国税庁のリンクだけ）", () => {
  for (const item of ITEMS) {
    const msg = buildMessage(item, "");
    assert.doesNotMatch(msg, /github\.io|消費税区分辞書」で/, item.name);
  }
});

test("画像があれば /photos に写真と説明文を送る", async (t) => {
  const { post } = require("../scripts/facebook-post.js");
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const img = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "fb-")), "card.png");
  fs.writeFileSync(img, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  const calls = [];
  t.mock.method(globalThis, "fetch", async (url, opts) => {
    calls.push({ url, body: opts.body });
    return new Response(JSON.stringify({ id: "1", post_id: "p_1" }), { status: 200 });
  });

  await post("123", "tok", "本文", "https://example.com/", "v23.0", img);
  assert.equal(calls[0].url, "https://graph.facebook.com/v23.0/123/photos");
  assert.equal(calls[0].body.get("caption"), "本文");
  assert.equal(calls[0].body.get("source").size, 4);

  await post("123", "tok", "本文", "https://example.com/", "v23.0", "");
  assert.equal(calls[1].url, "https://graph.facebook.com/v23.0/123/feed");
  assert.equal(calls[1].body.get("link"), "https://example.com/");
});

test("軽減8%の項目には税率引下げ（改正案）を載せ、新聞の定期購読は8%のままと書く", () => {
  const { rateCutNote } = require("../scripts/facebook-post.js");
  for (const item of ITEMS) {
    const msg = buildMessage(item, "https://example.com/");
    if (item.cat !== "k8") {
      assert.equal(rateCutNote(item), null, item.name);
      assert.doesNotMatch(msg, /税率引下げ/, item.name);
    } else if (item.name.includes("新聞")) {
      assert.match(msg, /新聞の定期購読は対象外で8%のまま/, item.name);
    } else {
      assert.match(msg, /令和11年（2029年）3月31日の2年間は、8%→1%に引き下げられる予定/, item.name);
      assert.match(msg, /#税率引下げ/, item.name);
    }
  }
});

test("今日すでに投稿があれば二重に投稿しない（日本時間で判定）", async (t) => {
  const { alreadyPostedToday } = require("../scripts/facebook-post.js");
  const now = new Date("2026-11-21T10:00:00+09:00");
  const posts = (list) => t.mock.method(globalThis, "fetch", async () => new Response(JSON.stringify({ data: list })));
  // 今日（JST）の投稿あり
  let m = posts([{ created_time: "2026-11-21T00:10:00+0000", message: "【今日の消費税区分】立替金" }]);
  assert.equal(await alreadyPostedToday("1", "t", "v23.0", now), true);
  m.mock.restore();
  // 前日（JST）の投稿だけ：UTC では同じ日付でも JST では前日
  m = posts([{ created_time: "2026-11-20T14:59:00+0000", message: "【今日の消費税区分】前日" }]);
  assert.equal(await alreadyPostedToday("1", "t", "v23.0", now), false);
  m.mock.restore();
  // 今日の投稿でも、自動投稿以外（手で書いた投稿）は数えない
  m = posts([{ created_time: "2026-11-21T01:00:00+0000", message: "お知らせ" }]);
  assert.equal(await alreadyPostedToday("1", "t", "v23.0", now), false);
  m.mock.restore();
  // 確認できないときは投稿を続ける
  m = t.mock.method(globalThis, "fetch", async () => new Response(JSON.stringify({ error: { message: "x" } })));
  assert.equal(await alreadyPostedToday("1", "t", "v23.0", now), false);
});

test("国税庁の関連ページ（タックスアンサー等・基本通達）のリンクを載せ、公開ページのアドレスは載せない", () => {
  const { ntaLinks } = require("../scripts/facebook-post.js");
  for (const item of ITEMS) {
    const msg = buildMessage(item, "");
    const links = ntaLinks(item);
    for (const l of links) assert.ok(msg.includes(l), item.name);
    for (const url of msg.match(/https?:\/\/\S+/g) || []) assert.match(url, /^https:\/\/www\.nta\.go\.jp\//, `${item.name}: ${url}`);
    if ((item.refs || []).length || (item.tsutatsu || []).length) assert.match(msg, /■ 国税庁の関連ページ/, item.name);
    assert.ok(msg.length < 3000, `${item.name}: 長すぎる`);
  }
  const k8 = ITEMS.find((i) => i.cat === "k8");
  assert.match(buildMessage(k8, ""), /消費税率引下げ特設サイト：https:\/\/www\.nta\.go\.jp\//);
});

test("Instagram：連携していれば Facebook の写真と同じ本文で投稿し、今日の投稿があれば投稿しない", async (t) => {
  const { postToInstagram, photoIdOf } = require("../scripts/facebook-post.js");
  const now = new Date().toISOString();
  let igMedia = [];
  const calls = [];
  t.mock.method(globalThis, "fetch", async (url, opts) => {
    const u = String(url);
    const R = (o) => new Response(JSON.stringify(o));
    calls.push(((opts && opts.method) || "GET") + " " + u.split("?")[0]);
    if (u.includes("fields=instagram_business_account")) return R({ instagram_business_account: { id: "IG1" } });
    if (u.includes("/IG1/media?")) return R({ data: igMedia });
    if (u.includes("fields=images")) return R({ images: [{ width: 1080, source: "https://cdn/l.jpg" }] });
    if (u.endsWith("/IG1/media")) { assert.equal(opts.body.get("caption"), "本文"); assert.equal(opts.body.get("image_url"), "https://cdn/l.jpg"); return R({ id: "C1" }); }
    if (u.includes("/C1?")) return R({ status_code: "FINISHED" });
    if (u.endsWith("/media_publish")) return R({ id: "M1" });
    throw new Error("unexpected " + u);
  });
  await postToInstagram("P", "t", "v23.0", "PH", "本文", "項目");
  assert.ok(calls.some((c) => c.endsWith("/IG1/media_publish")));
  calls.length = 0;
  igMedia = [{ caption: "【今日の消費税区分】項目", timestamp: now }];
  await postToInstagram("P", "t", "v23.0", "PH", "本文", "項目");
  assert.ok(!calls.some((c) => c.startsWith("POST")));
  assert.equal(photoIdOf({ attachments: { data: [{ target: { id: "PH9" } }] } }), "PH9");
});
