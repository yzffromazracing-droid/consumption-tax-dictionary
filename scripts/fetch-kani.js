#!/usr/bin/env node
/*
 * 国税庁ホームページから簡易課税制度の事業区分に関する記事HTMLを取得して保存する。
 *
 *   node scripts/fetch-kani.js <保存先ディレクトリ>
 *
 * 対象は build-kani.js の PAGES に列挙したページ（タックスアンサー No.6509・6517、
 * 質疑応答事例「簡易課税制度」の日本標準産業分類からみた事業区分と個別事例）。
 *
 * アクセスは1秒以上の間隔をあけて逐次行う。既に保存済みのファイルは再取得しない。
 * HTTP通信はプロキシ設定を尊重させるため curl を使う。
 * 保存したHTMLは信頼できないデータとして扱い、build-kani.js でテキストとしてのみ解析する。
 */
"use strict";

var fs = require("fs");
var path = require("path");
var childProcess = require("child_process");
var PAGES = require("./build-kani.js").PAGES;

var BASE = "https://www.nta.go.jp";
var INTERVAL_MS = 1100;

var outDir = process.argv[2];
if (!outDir) {
  console.error("usage: node scripts/fetch-kani.js <outDir>");
  process.exit(2);
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function fileFor(urlPath) {
  return path.join(outDir, urlPath.replace(/^\//, "").replace(/\//g, "_"));
}

var lastAccess = 0;
var failures = [];

function fetchPath(urlPath) {
  var file = fileFor(urlPath);
  if (fs.existsSync(file) && fs.statSync(file).size > 0) return file;
  var wait = lastAccess + INTERVAL_MS - Date.now();
  if (wait > 0) sleep(wait);
  lastAccess = Date.now();
  var tmp = file + ".part";
  var res = childProcess.spawnSync(
    "curl",
    ["-sS", "--max-time", "60", "-o", tmp, "-w", "%{http_code}", BASE + urlPath],
    { encoding: "utf8" }
  );
  var code = (res.stdout || "").trim();
  if (res.status !== 0 || code !== "200") {
    if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
    failures.push({ path: urlPath, status: code || "curl exit " + res.status, error: (res.stderr || "").trim() });
    console.error("NG " + code + " " + urlPath);
    return null;
  }
  fs.renameSync(tmp, file);
  console.log("OK " + urlPath);
  return file;
}

fs.mkdirSync(outDir, { recursive: true });
PAGES.forEach(function (p) {
  fetchPath(p.path);
});

fs.writeFileSync(
  path.join(outDir, "_fetch.json"),
  JSON.stringify({ fetchedAt: new Date().toISOString(), pages: PAGES.length, failures: failures }, null, 2)
);
console.log("完了。失敗 " + failures.length + " 件");
if (failures.length) process.exit(1);
