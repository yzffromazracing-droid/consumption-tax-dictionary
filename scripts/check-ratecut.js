#!/usr/bin/env node
/*
 * 国税庁「消費税率引下げ特設サイト」の更新を確認する。
 * 「税率引下げ」タブ（index.html の #tab-ratecut）は特設サイトの資料を手で要約したものなので、
 * 特設サイトが更新されていたら資料を読み直してタブを書き直す必要がある。
 *
 *   node scripts/check-ratecut.js           … 前回確認時（scripts/ratecut-known.json）との差を表示
 *   node scripts/check-ratecut.js --update  … 今の状態を scripts/ratecut-known.json に記録する
 *                                             （タブを書き直した後、または変更がなかったときに実行）
 *
 * 比べるもの：新着情報（日付と内容）、ページに載っているPDFのリンク、
 *             国税庁のPDFの更新日時・サイズ（同じファイル名のまま差し替えられた場合も分かるように）
 * 最後の行に「特設サイトの更新：あり／なし」を出す。取得に失敗したら終了コード 1。
 */
"use strict";

var fs = require("fs");
var os = require("os");
var path = require("path");
var childProcess = require("child_process");

var URL = "https://www.nta.go.jp/taxes/shiraberu/zeimokubetsu/shohi/keigenzeiritsu/zeiritsuhikisage.htm";
var KNOWN = path.join(__dirname, "ratecut-known.json");

function fetchPage() {
  var tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "ratecut-")), "page.htm");
  var res = childProcess.spawnSync("curl", ["-sS", "--max-time", "60", "-o", tmp, "-w", "%{http_code}", URL], { encoding: "utf8" });
  if (res.status !== 0 || (res.stdout || "").trim() !== "200") {
    console.error("特設サイトを取得できませんでした: " + (res.stdout || "") + " " + (res.stderr || ""));
    process.exit(1);
  }
  var buf = fs.readFileSync(tmp);
  var head = buf.slice(0, 2048).toString("latin1");
  var enc = /charset=["']?shift_jis/i.test(head) ? "shift_jis" : "utf-8";
  return new TextDecoder(enc).decode(buf);
}

function text(html) {
  return String(html)
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;|&emsp;|&ensp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/[\s　]+/g, " ")
    .trim();
}

// ページは信頼できないデータとして、テキストとリンクだけを取り出す
function parse(html) {
  html = html.replace(/<!--[\s\S]*?-->/g, "");
  var news = [];
  var re = /<div class="news-date">([\s\S]*?)<\/div>\s*<ul class="news-list">([\s\S]*?)<\/ul>/g;
  var m;
  while ((m = re.exec(html))) {
    var date = text(m[1]).normalize("NFKC");
    var items = [];
    var li = /<li[^>]*>([\s\S]*?)<\/li>/g;
    var l;
    while ((l = li.exec(m[2]))) items.push(text(l[1]));
    news.push({ date: date, items: items });
  }
  var pdfs = [];
  var a = /href="([^"]+\.pdf)"/gi;
  while ((m = a.exec(html))) {
    var href = m[1].indexOf("http") === 0 ? m[1] : "https://www.nta.go.jp" + m[1];
    if (pdfs.indexOf(href) < 0) pdfs.push(href);
  }
  return { news: news, pdfs: pdfs.sort() };
}

// PDFの更新日時・サイズ（HEAD リクエスト）
function pdfInfo(url) {
  var res = childProcess.spawnSync("curl", ["-sSI", "--max-time", "60", url], { encoding: "utf8" });
  if (res.status !== 0) return null;
  var lm = /^last-modified:\s*(.+)$/im.exec(res.stdout || "");
  var len = /^content-length:\s*(\d+)/im.exec(res.stdout || "");
  return { lastModified: lm ? lm[1].trim() : "", size: len ? Number(len[1]) : 0 };
}

var now = parse(fetchPage());
now.pdfInfo = {};
now.pdfs.forEach(function (url) {
  if (url.indexOf("https://www.nta.go.jp/") !== 0) return;
  var info = pdfInfo(url);
  if (info) now.pdfInfo[url] = info;
});
if (!now.news.length) {
  console.error("新着情報を読み取れませんでした（ページの構成が変わった可能性があります）");
  process.exit(1);
}

if (process.argv.includes("--update")) {
  fs.writeFileSync(KNOWN, JSON.stringify(Object.assign({ checked: new Date().toISOString().slice(0, 10), url: URL }, now), null, 2) + "\n");
  console.log("記録しました: " + KNOWN);
  process.exit(0);
}

var known = fs.existsSync(KNOWN) ? JSON.parse(fs.readFileSync(KNOWN, "utf8")) : { news: [], pdfs: [] };
var knownNews = known.news.map(function (n) {
  return n.date + "｜" + n.items.join("／");
});
var newNews = now.news.filter(function (n) {
  return knownNews.indexOf(n.date + "｜" + n.items.join("／")) < 0;
});
var addedPdfs = now.pdfs.filter(function (p) {
  return known.pdfs.indexOf(p) < 0;
});
var removedPdfs = known.pdfs.filter(function (p) {
  return now.pdfs.indexOf(p) < 0;
});

console.log("## 消費税率引下げ特設サイト（前回確認：" + (known.checked || "なし") + "）\n");
console.log(URL + "\n");
if (newNews.length) {
  console.log("新しい新着情報:");
  newNews.forEach(function (n) {
    console.log("- " + n.date + "：" + n.items.join("／"));
  });
  console.log("");
}
if (addedPdfs.length) console.log("新しいPDF:\n" + addedPdfs.map((p) => "- " + p).join("\n") + "\n");
if (removedPdfs.length) console.log("なくなったPDF:\n" + removedPdfs.map((p) => "- " + p).join("\n") + "\n");
var knownInfo = known.pdfInfo || {};
var revisedPdfs = Object.keys(now.pdfInfo).filter(function (url) {
  var k = knownInfo[url];
  var n = now.pdfInfo[url];
  return k && (k.lastModified !== n.lastModified || k.size !== n.size);
});
if (revisedPdfs.length) {
  console.log(
    "差し替えられたPDF（同じファイル名で更新日時・サイズが変わったもの）:\n" +
      revisedPdfs
        .map(function (url) {
          return "- " + url + "（" + knownInfo[url].lastModified + " → " + now.pdfInfo[url].lastModified + "）";
        })
        .join("\n") +
      "\n"
  );
}
var changed = newNews.length + addedPdfs.length + removedPdfs.length + revisedPdfs.length;
console.log("特設サイトの更新：" + (changed ? "あり" : "なし"));
