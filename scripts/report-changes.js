#!/usr/bin/env node
/*
 * 国税庁のデータを再取得・再生成した後に、コミット済みの版（既定は HEAD）と比べて変更点を報告する。
 *
 *   node scripts/report-changes.js [比較するコミット=HEAD]
 *
 * 対象：js/nta.js（国税庁の記事）・js/nta-body.js（全文）・js/tsutatsu.js（通達）・
 *       js/invoice.js（インボイス）・js/kani.js（簡易課税の事業区分）
 * 出力：Markdown（そのまま PR の本文に使える）。最後の行に「内容の変更：あり／なし」を出す。
 * 取得日（FETCHED_AT）だけが変わった場合は「内容の変更なし」として扱う。
 */
"use strict";

var fs = require("fs");
var os = require("os");
var path = require("path");
var childProcess = require("child_process");

var ROOT = path.join(__dirname, "..");
var REV = process.argv[2] || "HEAD";

// コミット済みの版のモジュールを読み込む（無ければ null）
function loadAt(rev, file) {
  var res = childProcess.spawnSync("git", ["show", rev + ":" + file], { cwd: ROOT, encoding: "utf8", maxBuffer: 1 << 28 });
  if (res.status !== 0) return null;
  var tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "report-")), path.basename(file));
  fs.writeFileSync(tmp, res.stdout);
  return require(tmp);
}

function loadNow(file) {
  var p = path.join(ROOT, file);
  delete require.cache[require.resolve(p)];
  return require(p);
}

function byKey(list, key) {
  var map = {};
  list.forEach(function (x) {
    map[key(x)] = x;
  });
  return map;
}

// 一覧の差分：追加・削除・変更（指定した項目の値が変わったもの）
function diffList(oldList, newList, key, label, fields) {
  var o = byKey(oldList, key);
  var n = byKey(newList, key);
  var added = Object.keys(n).filter(function (k) {
    return !(k in o);
  });
  var removed = Object.keys(o).filter(function (k) {
    return !(k in n);
  });
  var changed = [];
  Object.keys(n).forEach(function (k) {
    if (!(k in o)) return;
    var what = fields.filter(function (f) {
      return JSON.stringify(o[k][f]) !== JSON.stringify(n[k][f]);
    });
    if (what.length) changed.push({ k: k, what: what });
  });
  var lines = [];
  added.forEach(function (k) {
    lines.push("- 追加：" + label(n[k]));
  });
  removed.forEach(function (k) {
    lines.push("- 削除：" + label(o[k]));
  });
  changed.forEach(function (c) {
    lines.push("- 変更（" + c.what.join("・") + "）：" + label(n[c.k]));
  });
  return { count: added.length + removed.length + changed.length, lines: lines, before: oldList.length, after: newList.length };
}

var sections = [];
var total = 0;

function report(title, oldData, newData, fn) {
  if (!newData) return;
  if (!oldData) {
    sections.push("### " + title + "\n\n新規作成");
    total++;
    return;
  }
  var r = fn(oldData, newData);
  total += r.count;
  var head =
    "### " + title + "\n\n" +
    "取得日 " + (oldData.FETCHED_AT || "-") + " → " + (newData.FETCHED_AT || "-") +
    "、件数 " + r.before + " → " + r.after + "\n\n";
  var MAX = 40;
  var body = r.count
    ? r.lines.slice(0, MAX).join("\n") + (r.lines.length > MAX ? "\n- …ほか " + (r.lines.length - MAX) + " 件" : "")
    : "内容の変更なし";
  sections.push(head + body);
}

// 国税庁の記事
report("国税庁の記事（タックスアンサー・質疑応答事例）", loadAt(REV, "js/nta.js"), loadNow("js/nta.js"), function (o, n) {
  return diffList(
    o.ARTICLES,
    n.ARTICLES,
    function (a) {
      return a.url;
    },
    function (a) {
      return (a.type === "taxanswer" ? "No." : "事例 ") + a.no + " " + a.title;
    },
    ["title", "category", "summary", "asOf"]
  );
});

// 全文（本文だけが変わった記事を拾う）
(function () {
  var o = loadAt(REV, "js/nta-body.js");
  var n = loadNow("js/nta-body.js");
  var list = loadNow("js/nta.js").ARTICLES;
  if (!o || !n) return;
  var title = byKey(list, function (a) {
    return a.url;
  });
  var lines = [];
  Object.keys(n).forEach(function (url) {
    if (url in o && JSON.stringify(o[url]) !== JSON.stringify(n[url])) {
      var a = title[url];
      lines.push("- 本文の変更：" + (a ? (a.type === "taxanswer" ? "No." : "事例 ") + a.no + " " + a.title : url));
    }
  });
  total += lines.length;
  sections.push("### 国税庁の記事の全文\n\n" + (lines.length ? lines.slice(0, 40).join("\n") + (lines.length > 40 ? "\n- …ほか " + (lines.length - 40) + " 件" : "") : "本文の変更なし（追加・削除は上の一覧を参照）"));
})();

// 通達
report("通達（基本通達・取扱通達）", loadAt(REV, "js/tsutatsu.js"), loadNow("js/tsutatsu.js"), function (o, n) {
  return diffList(
    o.ARTICLES,
    n.ARTICLES,
    function (a) {
      return a.url + "#" + a.no;
    },
    function (a) {
      return a.no + " " + a.title;
    },
    ["title", "category", "section", "summary", "status"]
  );
});

// インボイス
report("インボイス（概要・Q&A）", loadAt(REV, "js/invoice.js"), loadNow("js/invoice.js"), function (o, n) {
  var qa = diffList(
    o.QA,
    n.QA,
    function (q) {
      return q.no;
    },
    function (q) {
      return "問" + q.no + " " + q.title;
    },
    ["title", "category", "question", "summary"]
  );
  var ov = diffList(
    o.OVERVIEW,
    n.OVERVIEW,
    function (x) {
      return x.url;
    },
    function (x) {
      return "概要 " + x.title;
    },
    ["title", "asOf", "sections"]
  );
  return { count: qa.count + ov.count, lines: ov.lines.concat(qa.lines), before: o.QA.length, after: n.QA.length };
});

// 簡易課税
report("簡易課税の事業区分", loadAt(REV, "js/kani.js"), loadNow("js/kani.js"), function (o, n) {
  var key = function (e) {
    return JSON.stringify([e.k, e.t, e.maj, e.mid, e.min, e.text, e.title]);
  };
  var r = diffList(
    o.ENTRIES,
    n.ENTRIES,
    key,
    function (e) {
      return "第" + e.t.join("・") + "種 " + (e.k === "i" ? e.min.join("・") : (e.title || e.text).slice(0, 60));
    },
    []
  );
  var defs = [1, 2, 3, 4, 5, 6].filter(function (t) {
    return JSON.stringify(o.TYPES[t]) !== JSON.stringify(n.TYPES[t]);
  });
  defs.forEach(function (t) {
    r.lines.push("- 変更：第" + t + "種事業の定義・判定のポイント（No.6509）");
  });
  r.count += defs.length;
  return r;
});

console.log("## 国税庁のデータの変更点（" + REV + " との比較）\n");
console.log(sections.join("\n\n"));
console.log("\n内容の変更：" + (total ? "あり（" + total + " 件）" : "なし"));
