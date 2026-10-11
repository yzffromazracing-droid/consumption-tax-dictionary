#!/usr/bin/env node
/*
 * 辞書の項目を1日1件、Facebookページに投稿する。
 *
 *   node scripts/facebook-post.js [--dry-run] [--date=YYYY-MM-DD]
 *
 * 環境変数:
 *   FB_PAGE_ID           : 投稿先のFacebookページID
 *   FB_PAGE_ACCESS_TOKEN : ページアクセストークン（pages_manage_posts 権限）
 *   SITE_URL             : 投稿に添えるサイトのURL（任意）
 *   FB_GRAPH_VERSION     : Graph APIのバージョン（任意。既定 v23.0）
 *
 * 項目は日付（日本時間）から決まるので、160日で全項目を一巡する。
 * --dry-run またはトークン未設定のときは投稿せず本文を表示するだけ。
 */
"use strict";

var data = require("../js/data.js");

var DAY_MS = 24 * 60 * 60 * 1000;
var JST_OFFSET_MS = 9 * 60 * 60 * 1000;

// 日本時間の日付を 1970-01-01 からの日数にする
function dayIndex(date) {
  return Math.floor((date.getTime() + JST_OFFSET_MS) / DAY_MS);
}

function pickItem(date, items) {
  items = items || data.ITEMS;
  var n = dayIndex(date) % items.length;
  return items[(n + items.length) % items.length];
}

function hashtag(s) {
  return "#" + s.replace(/[\s・（）()／/、%％]/g, "");
}

function buildMessage(item, siteUrl) {
  var cat = data.CATEGORIES[item.cat];
  var lines = [];
  lines.push("【今日の消費税区分】" + item.name);
  lines.push("");
  lines.push("▶ 区分：" + cat.label);
  lines.push("▶ 主な勘定科目：" + item.accounts.join("、"));
  lines.push("");
  lines.push(item.desc);
  if (item.examples && item.examples.length) {
    lines.push("");
    lines.push("■ 具体例");
    item.examples.forEach(function (ex) { lines.push("・" + ex); });
  }
  if (item.kani && item.kani.length) {
    lines.push("");
    lines.push("■ 簡易課税の事業区分");
    item.kani.forEach(function (k) {
      var t = data.KANI_TYPES[k[0]];
      lines.push("・" + t.label + "（" + t.kind + "・みなし仕入率" + t.rate + "）：" + k[1]);
    });
  }
  if (item.note) {
    lines.push("");
    lines.push("⚠ 注意：" + item.note);
  }
  if (siteUrl) {
    lines.push("");
    lines.push("ほかの取引の区分は「消費税区分辞書」で検索できます。");
    lines.push(siteUrl);
  }
  lines.push("");
  lines.push(["#消費税", hashtag(cat.short), "#経理", "#インボイス"].join(" "));
  return lines.join("\n");
}

async function post(pageId, token, message, link, version) {
  var url = "https://graph.facebook.com/" + (version || "v23.0") + "/" + encodeURIComponent(pageId) + "/feed";
  var body = new URLSearchParams({ message: message, access_token: token });
  if (link) body.set("link", link);
  var res = await fetch(url, { method: "POST", body: body });
  var json = await res.json().catch(function () { return {}; });
  if (!res.ok || json.error) {
    var err = json.error || {};
    throw new Error("Facebook API error " + res.status + ": " + (err.message || JSON.stringify(json)));
  }
  return json;
}

async function main() {
  var args = process.argv.slice(2);
  var dryRun = args.indexOf("--dry-run") !== -1;
  var dateArg = args.filter(function (a) { return a.indexOf("--date=") === 0; })[0];
  // --date は日本時間のその日の正午として扱う
  var date = dateArg ? new Date(dateArg.slice(7) + "T12:00:00+09:00") : new Date();
  if (isNaN(date.getTime())) {
    console.error("invalid --date");
    process.exit(2);
  }

  var siteUrl = process.env.SITE_URL || "";
  var item = pickItem(date);
  var message = buildMessage(item, siteUrl);

  var pageId = process.env.FB_PAGE_ID;
  var token = process.env.FB_PAGE_ACCESS_TOKEN;
  if (dryRun || !pageId || !token) {
    if (!dryRun) console.error("FB_PAGE_ID / FB_PAGE_ACCESS_TOKEN が未設定のため投稿せず本文を表示します。");
    console.log(message);
    return;
  }

  var result = await post(pageId, token, message, siteUrl, process.env.FB_GRAPH_VERSION);
  console.log("posted: " + result.id + " (" + item.name + ")");
}

if (require.main === module) {
  main().catch(function (e) {
    console.error(e.message);
    process.exit(1);
  });
}

module.exports = { dayIndex: dayIndex, pickItem: pickItem, buildMessage: buildMessage };
