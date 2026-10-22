#!/usr/bin/env node
/*
 * fetch-nta.js で保存した国税庁ホームページのHTMLから js/nta.js（記事一覧・要旨）と
 * js/nta-body.js（全文）を生成する。
 *
 *   node scripts/build-nta.js <保存先ディレクトリ> [出力ファイル=js/nta.js]
 *
 * HTMLは信頼できないデータとして扱い、正規表現でテキストを抜き出すだけにする
 * （スクリプトの実行やDOMへの挿入はしない）。
 */
"use strict";

var fs = require("fs");
var path = require("path");

var BASE = "https://www.nta.go.jp";
var TA_INDEX = "/taxes/shiraberu/taxanswer/code/index.htm";
var QA_INDEX = "/law/shitsugi/shohi/01.htm";
var SUMMARY_LEN = 200;

var dir = process.argv[2];
var outFile = process.argv[3] || path.join(__dirname, "..", "js", "nta.js");
var bodyFile = path.join(path.dirname(outFile), "nta-body.js"); // 全文（記事を開いたときに読み込む）
if (!dir) {
  console.error("usage: node scripts/build-nta.js <htmlDir> [outFile]");
  process.exit(2);
}

function fileFor(urlPath) {
  return path.join(dir, urlPath.replace(/^\//, "").replace(/\//g, "_"));
}

function read(urlPath) {
  var file = fileFor(urlPath);
  if (!fs.existsSync(file)) return null;
  var buf = fs.readFileSync(file);
  var head = buf.slice(0, 2048).toString("latin1");
  var enc = /charset=["']?shift_jis/i.test(head) ? "shift_jis" : "utf-8";
  return new TextDecoder(enc).decode(buf);
}

var ENTITIES = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", hellip: "…", mdash: "—", ndash: "–",
  minus: "−", times: "×", divide: "÷", yen: "¥", middot: "・", rarr: "→", larr: "←", uarr: "↑",
  darr: "↓", harr: "↔", rArr: "⇒", hArr: "⇔", laquo: "«", raquo: "»", lsquo: "‘", rsquo: "’",
  ldquo: "“", rdquo: "”", deg: "°", plusmn: "±", sup2: "²", sup3: "³", frac12: "½", sect: "§",
  copy: "©", reg: "®", bull: "•", circ: "ˆ", tilde: "˜", ensp: " ", emsp: " ", thinsp: " ",
};

function text(html) {
  return String(html)
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>|<\/p>|<\/li>|<\/h\d>|<\/tr>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, function (m, e) {
      if (e[0] === "#") {
        var code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return isFinite(code) ? String.fromCodePoint(code) : "";
      }
      return ENTITIES[e] || ENTITIES[e.toLowerCase()] || m;
    })
    .replace(/[\s　]+/g, " ")
    .trim();
}

function clip(str) {
  str = str.replace(/^[\s　]+/, "");
  if (str.length <= SUMMARY_LEN) return str;
  return str.slice(0, SUMMARY_LEN) + "…";
}

// 本文（h1 の後からページ先頭へのリンクまで）
function mainBody(html) {
  var start = html.search(/<h1[\s>]/i);
  if (start < 0) return "";
  var body = html.slice(start);
  var end = body.search(/class="page-top-link"|<!-- InstanceEndEditable -->/);
  return end >= 0 ? body.slice(0, end) : body;
}

function sectionAfter(body, headingRe, stopRe) {
  var m = headingRe.exec(body);
  if (!m) return null;
  var rest = body.slice(m.index + m[0].length);
  var stop = rest.search(stopRe);
  return stop >= 0 ? rest.slice(0, stop) : rest;
}

/* ---------- 全文 ---------- */

/*
 * 記事の全文を表示用のブロックに変換する。HTMLはそのまま使わず、テキストと構造だけを取り出す。
 *   ["h", 段, 見出し] / ["p", 段落] / ["li", 箇条書き] / ["t", 行の配列]
 *   表の行はセルの配列で、セルは { x: テキスト, h: 見出しセルなら1, r: rowspan, c: colspan }
 * 段落内の改行（<br>）は "\n" で残す。
 */
var BR = "";

// 画像は文字に置き換える（丸数字・記号）か、図であることだけを示す
function replaceImages(html) {
  return html.replace(/<img\b[^>]*>/gi, function (tag) {
    var src = (/\bsrc="([^"]*)"/i.exec(tag) || [])[1] || "";
    var alt = text((/\balt="([^"]*)"/i.exec(tag) || [])[1] || "");
    var num = /\/(?:decimal|no_img)\/0*(\d+)\.\w+$/.exec(src);
    if (num) {
      var n = Number(num[1]);
      return n >= 1 && n <= 20 ? String.fromCharCode(0x2460 + n - 1) : "(" + n + ")";
    }
    if (/\/mark\/maru\./.test(src)) return "○";
    if (/\/mark\/m2\./.test(src)) return "㎡";
    if (/\/template\/|\/top_img\/|\/open\.png$/.test(src)) return "";
    if (alt === "undefined") alt = "";
    return "［図" + (alt ? "：" + alt : "") + "（原文を参照）］";
  });
}

function textBr(html) {
  return text(String(html).replace(/<br\s*\/?>|<\/p>\s*<p[^>]*>/gi, BR))
    .split(BR)
    .map(function (line) {
      return line.trim();
    })
    .filter(Boolean)
    .join("\n");
}

function parseTable(html) {
  var rows = [];
  var rowRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
  var m;
  while ((m = rowRe.exec(html))) {
    var cells = [];
    var cellRe = /<(th|td)\b([^>]*)>([\s\S]*?)<\/\1>/gi;
    var c;
    while ((c = cellRe.exec(m[1]))) {
      var cell = { x: textBr(c[3]) };
      if (c[1].toLowerCase() === "th") cell.h = 1;
      var rs = /rowspan="?(\d+)/i.exec(c[2]);
      var cs = /colspan="?(\d+)/i.exec(c[2]);
      if (rs && Number(rs[1]) > 1) cell.r = Number(rs[1]);
      if (cs && Number(cs[1]) > 1) cell.c = Number(cs[1]);
      cells.push(cell);
    }
    if (cells.length) rows.push(cells);
  }
  return rows;
}

// 載せない節（タックスアンサーの「対象税目」「関連リンク」「お問い合わせ先」以降）
var SKIP_H2 = /^(対象税目|関連リンク)$/;
var STOP_H2 = /^お問い合わせ先$/;

// 区切り記号（本文には現れない私用文字）
var LINE = ""; // 行の区切り
var ITEM = ""; // 箇条書きの行の先頭
var HEAD = ""; // 見出しの行の先頭（直後に段の数字）
var TABLE = ""; // 表の位置（前後で挟んだ番号）

/*
 * 入れ子の箇条書きや <div> の段落でも本文を落とさないよう、ブロック要素の境目をすべて
 * 行の区切りにしてから、行ごとに見出し・箇条書き・表・段落に分ける。
 */
function bodyBlocks(html) {
  var body = mainBody(html)
    .replace(/^<h1[\s\S]*?<\/h1>/i, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "");
  body = replaceImages(body);
  var tables = [];
  body = body
    .replace(/<table\b[\s\S]*?<\/table>/gi, function (t) {
      var cap = /<caption[^>]*>([\s\S]*?)<\/caption>/i.exec(t);
      tables.push({ caption: cap ? textBr(cap[1]) : "", rows: parseTable(t) });
      return LINE + TABLE + (tables.length - 1) + TABLE + LINE;
    })
    .replace(/<h([2-5])\b[^>]*>/gi, LINE + HEAD + "$1")
    .replace(/<li\b[^>]*>/gi, LINE + ITEM)
    .replace(/<\/?(p|div|ul|ol|dl|dt|dd|li|h[2-5]|blockquote|section)\b[^>]*>/gi, LINE)
    .replace(/<br\s*\/?>/gi, BR);
  var blocks = [];
  var skipping = false;
  var stopped = false;
  text(body)
    .split(LINE)
    .forEach(function (raw) {
      if (stopped) return;
      var line = raw
        .split(BR)
        .map(function (l) {
          return l.trim();
        })
        .filter(Boolean)
        .join("\n");
      if (!line) return;
      var tm = new RegExp("^" + TABLE + "(\\d+)" + TABLE + "$").exec(line);
      if (tm) {
        if (skipping) return;
        var t = tables[Number(tm[1])];
        if (t.caption) blocks.push(["p", t.caption]);
        if (t.rows.length) blocks.push(["t", t.rows]);
        return;
      }
      if (line[0] === HEAD) {
        var level = Number(line[1]);
        var str = line.slice(2).trim();
        if (level === 2 && STOP_H2.test(str)) {
          stopped = true;
          return;
        }
        if (level === 2) skipping = SKIP_H2.test(str);
        if (!skipping && str) blocks.push(["h", level, str]);
        return;
      }
      if (skipping) return;
      if (line[0] === ITEM) {
        var item = line.slice(1).trim();
        if (item) blocks.push(["li", item]);
        return;
      }
      blocks.push(["p", line]);
    });
  return blocks;
}

/* ---------- タックスアンサー ---------- */

function parseTaxAnswerIndex(html) {
  var re = /<h2[^>]*>([\s\S]*?)<\/h2>|<h3[^>]*>([\s\S]*?)<\/h3>|<a href="(\/taxes\/shiraberu\/taxanswer\/shohi\/(\d+)\.htm)">([\s\S]*?)<\/a>/g;
  var h2 = "";
  var h3 = "";
  var seen = {};
  var out = [];
  var m;
  while ((m = re.exec(html))) {
    if (m[1] !== undefined) {
      h2 = text(m[1]);
      h3 = "";
    } else if (m[2] !== undefined) {
      h3 = text(m[2]);
    } else {
      var no = m[4];
      if (seen[no]) continue;
      seen[no] = true;
      var title = text(m[5]).replace(new RegExp("^" + no + "\\s*"), "");
      var category = h2 === "消費税" ? h3 || h2 : [h2, h3].filter(Boolean).join("／");
      out.push({ path: m[3], no: no, title: title, category: category });
    }
  }
  return out;
}

function taxAnswerSummary(html) {
  var body = mainBody(html);
  var stop = /<h2[^>]*>\s*(根拠法令等|関連コード|お問い合わせ先)/;
  var part = sectionAfter(body, /<h2[^>]*>\s*概要\s*<\/h2>/, stop);
  if (part === null) {
    part = body.replace(/^<h1[\s\S]*?<\/h1>/i, "");
    var s = part.search(stop);
    if (s >= 0) part = part.slice(0, s);
    part = part.replace(/<h2[^>]*>\s*対象税目\s*<\/h2>\s*<p>[\s\S]*?<\/p>/, "");
  }
  return clip(text(part).replace(/^\[[^\]]*現在[^\]]*\]\s*/, ""));
}

function taxAnswerAsOf(html) {
  var m = /\[([^\]]*現在[^\]]*)\]/.exec(mainBody(html));
  return m ? text(m[1]) : "";
}

/* ---------- 質疑応答事例 ---------- */

function parseQaIndex(html) {
  var re = /<a id="(a-\d+)"[^>]*><\/a>\s*（([\s\S]*?)）\s*<\/p>|<a href="(\/law\/shitsugi\/shohi\/(\d+)\/(\d+)\.htm)">([\s\S]*?)<\/a>/g;
  var category = "";
  var seen = {};
  var out = [];
  var m;
  while ((m = re.exec(html))) {
    if (m[1] !== undefined) {
      category = text(m[2]);
    } else {
      if (seen[m[3]]) continue;
      seen[m[3]] = true;
      out.push({ path: m[3], no: m[4] + "-" + m[5], title: text(m[6]), category: category });
    }
  }
  return out;
}

function qaSummary(html) {
  var body = mainBody(html);
  var part = sectionAfter(body, /<h2[^>]*>\s*【回答要旨】\s*<\/h2>/, /<h2[^>]*>/);
  if (part === null) part = body.replace(/^<h1[\s\S]*?<\/h1>/i, "");
  return clip(text(part));
}

function qaAsOf(html) {
  var m = /(令和|平成)(\d+|元)年(\d+)月(\d+)日現在の法令・通達等/.exec(text(mainBody(html)));
  return m ? m[0].replace("の法令・通達等", "") : "";
}

/* ---------- 生成 ---------- */

var taIndexHtml = read(TA_INDEX);
var qaIndexHtml = read(QA_INDEX);
if (!taIndexHtml || !qaIndexHtml) {
  console.error("索引ページのHTMLがありません。先に fetch-nta.js を実行してください。");
  process.exit(1);
}
// 索引でコメントアウトされている記事（国税庁が目次から外したもの）は載せない
taIndexHtml = taIndexHtml.replace(/<!--[\s\S]*?-->/g, "");
qaIndexHtml = qaIndexHtml.replace(/<!--[\s\S]*?-->/g, "");

var meta = {};
try {
  meta = JSON.parse(fs.readFileSync(path.join(dir, "_fetch.json"), "utf8"));
} catch (e) {
  meta = {};
}

var missing = [];
var articles = [];
var bodies = {};

parseTaxAnswerIndex(taIndexHtml).forEach(function (a) {
  var html = read(a.path);
  if (!html) {
    missing.push(a.path);
    return;
  }
  articles.push({
    type: "taxanswer",
    no: a.no,
    title: a.title,
    category: a.category,
    url: BASE + a.path,
    summary: taxAnswerSummary(html),
    asOf: taxAnswerAsOf(html),
  });
  bodies[BASE + a.path] = bodyBlocks(html);
});

parseQaIndex(qaIndexHtml).forEach(function (a) {
  var html = read(a.path);
  if (!html) {
    missing.push(a.path);
    return;
  }
  articles.push({
    type: "qa",
    no: a.no,
    title: a.title,
    category: a.category,
    url: BASE + a.path,
    summary: qaSummary(html),
    asOf: qaAsOf(html),
  });
  bodies[BASE + a.path] = bodyBlocks(html);
});

var fetchedAt = (meta.fetchedAt || new Date().toISOString()).slice(0, 10);

var src =
  "/*\n" +
  " * 国税庁ホームページに掲載されている消費税関係の記事一覧（自動生成）\n" +
  " *\n" +
  " *   出典：国税庁ホームページ（https://www.nta.go.jp/）\n" +
  " *   取得日：" + fetchedAt + "\n" +
  " *   生成：node scripts/fetch-nta.js <dir> && node scripts/build-nta.js <dir>\n" +
  " *\n" +
  " * 各記事:\n" +
  " *   type     : taxanswer（タックスアンサー）/ qa（質疑応答事例）\n" +
  " *   no       : タックスアンサーは No.、質疑応答事例は URL の目次番号-事例番号\n" +
  " *   title    : タイトル\n" +
  " *   category : 分類（国税庁の目次の見出し）\n" +
  " *   url      : 国税庁の原文URL\n" +
  " *   summary  : 要旨（本文の概要・【回答要旨】の冒頭" + SUMMARY_LEN + "字程度）\n" +
  " *   asOf     : 記事に記載された基準日（「令和○年○月○日現在」）\n" +
  " *\n" +
  " * 手で編集せず、スクリプトで再生成すること。\n" +
  " */\n" +
  "(function (root) {\n" +
  '  "use strict";\n\n' +
  "  var FETCHED_AT = " + JSON.stringify(fetchedAt) + ";\n\n" +
  "  var TYPES = {\n" +
  '    taxanswer: { label: "タックスアンサー", index: "' + BASE + TA_INDEX + '" },\n' +
  '    qa: { label: "質疑応答事例", index: "' + BASE + QA_INDEX + '" },\n' +
  "  };\n\n" +
  "  var ARTICLES = [\n" +
  articles
    .map(function (a) {
      return "    " + JSON.stringify(a);
    })
    .join(",\n") +
  "\n  ];\n\n" +
  "  var api = { FETCHED_AT: FETCHED_AT, TYPES: TYPES, ARTICLES: ARTICLES };\n\n" +
  '  if (typeof module !== "undefined" && module.exports) {\n' +
  "    module.exports = api;\n" +
  "  } else {\n" +
  "    root.NTA_ARTICLES = ARTICLES;\n" +
  "    root.NTA_DATA = api;\n" +
  "  }\n" +
  '})(typeof self !== "undefined" ? self : this);\n';

fs.writeFileSync(outFile, src);

var bodySrc =
  "/*\n" +
  " * 国税庁ホームページの消費税関係の記事の全文（自動生成。手で編集しない）\n" +
  " *\n" +
  " *   出典：国税庁ホームページ（https://www.nta.go.jp/）　取得日：" + fetchedAt + "\n" +
  " *   生成：node scripts/build-nta.js <dir>\n" +
  " *\n" +
  " * 記事のURL → 本文のブロックの配列（形式は scripts/build-nta.js の bodyBlocks を参照）。\n" +
  " * 画像の丸数字・記号は文字に置き換え、図は「［図：…（原文を参照）］」とした。\n" +
  " * 容量が大きいため、画面では記事を開いたとき・記事を検索したときに読み込む。\n" +
  " */\n" +
  "(function (root) {\n" +
  '  "use strict";\n\n' +
  "  var BODIES = {\n" +
  Object.keys(bodies)
    .map(function (url) {
      return "    " + JSON.stringify(url) + ": " + JSON.stringify(bodies[url]);
    })
    .join(",\n") +
  "\n  };\n\n" +
  '  if (typeof module !== "undefined" && module.exports) {\n' +
  "    module.exports = BODIES;\n" +
  "  } else {\n" +
  "    root.NTA_BODIES = BODIES;\n" +
  "  }\n" +
  '})(typeof self !== "undefined" ? self : this);\n';
fs.writeFileSync(bodyFile, bodySrc);
console.log("生成: " + bodyFile);

var counts = {};
articles.forEach(function (a) {
  counts[a.type] = (counts[a.type] || 0) + 1;
});
console.log("生成: " + outFile);
console.log("タックスアンサー " + (counts.taxanswer || 0) + " 件 / 質疑応答事例 " + (counts.qa || 0) + " 件");
var empty = articles.filter(function (a) {
  return !a.summary;
});
if (empty.length) console.log("要旨が空: " + empty.map((a) => a.url).join(", "));
if (missing.length) console.log("HTML未取得: " + missing.join(", "));
