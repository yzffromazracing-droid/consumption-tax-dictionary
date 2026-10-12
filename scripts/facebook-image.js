#!/usr/bin/env node
/*
 * Facebook投稿に添える図解カード（1080×1080）をSVGで作り、PNGに変換する。
 *
 *   node scripts/facebook-image.js <出力.png|出力.svg> [--date=YYYY-MM-DD]
 *
 * PNGへの変換には rsvg-convert（librsvg2-bin）と日本語フォント
 * （fonts-noto-cjk）が必要。GitHub Actions ではワークフローでインストールする。
 */
"use strict";

var fs = require("fs");
var childProcess = require("child_process");
var data = require("../js/data.js");

var SIZE = 1080;
var FONT = "'Noto Sans CJK JP', 'Noto Sans JP', 'WenQuanYi Zen Hei', sans-serif";

// css/style.css の区分の色に合わせる
var COLORS = {
  k10: { main: "#c2410c", bg: "#fff1e8", soft: "#fdd9c2" },
  k8: { main: "#15803d", bg: "#e9f8ee", soft: "#bfe8cc" },
  hi: { main: "#1d4ed8", bg: "#e8effe", soft: "#c3d4fb" },
  fu: { main: "#4b5563", bg: "#eef0f3", soft: "#d3d8df" },
  men: { main: "#7e22ce", bg: "#f4eafd", soft: "#e0c7f8" },
};

function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// 全角を1、半角を0.55として幅を数える
function charWidth(ch) {
  return /[\u0000-ÿ｡-ﾟ]/.test(ch) ? 0.55 : 1;
}

function textWidth(s) {
  var w = 0;
  for (var ch of s) w += charWidth(ch);
  return w;
}

// 行頭に来てはいけない文字
var NO_START = "、。，．・：；？！）」』】〕ー～ぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮ";

// 1行あたり max（全角文字数）で折り返し、maxLines を超えたら「…」で切る
function wrap(s, max, maxLines) {
  var lines = [];
  var cur = "";
  var w = 0;
  for (var ch of s) {
    var cw = charWidth(ch);
    if (w + cw > max && cur && NO_START.indexOf(ch) === -1) {
      lines.push(cur);
      cur = "";
      w = 0;
    }
    cur += ch;
    w += cw;
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) {
    lines = lines.slice(0, maxLines);
    var last = lines[maxLines - 1];
    while (textWidth(last) > max - 1) last = Array.from(last).slice(0, -1).join("");
    lines[maxLines - 1] = last + "…";
  }
  return lines;
}

// 区分ごとの挿絵（中心 0,0、おおよそ 320×320 の範囲）
function illustration(cat, c) {
  var m = c.main;
  var s = c.soft;
  switch (cat) {
    case "k10": // 買い物袋とレシート
      return [
        '<rect x="-150" y="-60" width="200" height="200" rx="18" fill="' + s + '" stroke="' + m + '" stroke-width="8"/>',
        '<path d="M-100 -60 v-30 a50 50 0 0 1 100 0 v30" fill="none" stroke="' + m + '" stroke-width="10" stroke-linecap="round"/>',
        '<text x="-50" y="70" text-anchor="middle" font-size="84" font-weight="700" fill="' + m + '">10%</text>',
        '<path d="M60 -140 h110 v270 l-18 -14 l-18 14 l-18 -14 l-18 14 l-18 -14 l-20 14 z" fill="#fff" stroke="' + m + '" stroke-width="6" stroke-linejoin="round"/>',
        '<path d="M80 -100 h70 M80 -70 h50 M80 -40 h70 M80 -10 h40 M80 40 h70" stroke="' + m + '" stroke-width="6" stroke-linecap="round"/>',
      ].join("");
    case "k8": // おにぎりと新聞
      return [
        '<rect x="20" y="-140" width="150" height="190" rx="10" fill="#fff" stroke="' + m + '" stroke-width="6" transform="rotate(8 95 -45)"/>',
        '<path d="M45 -110 h100 M45 -80 h100 M45 -50 h60 M45 -20 h100 M45 10 h80" stroke="' + m + '" stroke-width="6" stroke-linecap="round" transform="rotate(8 95 -45)"/>',
        '<path d="M-60 -110 C-20 -110 60 20 60 80 Q60 130 -60 130 Q-180 130 -180 80 C-180 20 -100 -110 -60 -110 z" fill="#fff" stroke="' + m + '" stroke-width="8"/>',
        '<rect x="-115" y="45" width="110" height="85" rx="6" fill="' + m + '"/>',
        '<text x="-60" y="115" text-anchor="middle" font-size="64" font-weight="700" fill="#fff">8%</text>',
        '<circle cx="-85" cy="-10" r="6" fill="' + s + '"/><circle cx="-40" cy="-30" r="6" fill="' + s + '"/><circle cx="-20" cy="10" r="6" fill="' + s + '"/>',
      ].join("");
    case "hi": // 盾（社会政策的な配慮で課税しない）
      return [
        '<path d="M0 -150 L130 -100 V0 C130 80 70 130 0 160 C-70 130 -130 80 -130 0 V-100 z" fill="' + s + '" stroke="' + m + '" stroke-width="10" stroke-linejoin="round"/>',
        '<circle cx="0" cy="0" r="62" fill="#fff" stroke="' + m + '" stroke-width="8"/>',
        '<text x="0" y="22" text-anchor="middle" font-size="64" font-weight="700" fill="' + m + '">¥</text>',
        '<path d="M-70 70 L70 -70" stroke="' + m + '" stroke-width="12" stroke-linecap="round"/>',
      ].join("");
    case "fu": // 枠の外（課税の対象外）
      return [
        '<rect x="-160" y="-150" width="220" height="220" rx="20" fill="#fff" stroke="' + m + '" stroke-width="8" stroke-dasharray="22 14"/>',
        '<text x="-50" y="-25" text-anchor="middle" font-size="44" font-weight="700" fill="' + m + '">課税対象</text>',
        '<circle cx="100" cy="90" r="66" fill="' + s + '" stroke="' + m + '" stroke-width="8"/>',
        '<text x="100" y="113" text-anchor="middle" font-size="66" font-weight="700" fill="' + m + '">外</text>',
        '<path d="M5 30 L45 55" stroke="' + m + '" stroke-width="8" stroke-linecap="round"/>',
      ].join("");
    case "men": // 地球と飛行機（輸出）
      return [
        '<circle cx="-20" cy="20" r="130" fill="' + s + '" stroke="' + m + '" stroke-width="8"/>',
        '<ellipse cx="-20" cy="20" rx="60" ry="130" fill="none" stroke="' + m + '" stroke-width="6"/>',
        '<path d="M-150 20 h260 M-130 -45 h220 M-130 85 h220" stroke="' + m + '" stroke-width="6"/>',
        '<g transform="translate(110 -110) rotate(-35)">',
        '<path d="M-70 0 Q-70 -12 -50 -12 H60 Q80 -12 90 0 Q80 12 60 12 H-50 Q-70 12 -70 0 z" fill="#fff" stroke="' + m + '" stroke-width="6"/>',
        '<path d="M-5 -12 L-40 -70 H-15 L35 -12 M-5 12 L-40 70 H-15 L35 12 M-55 -12 L-70 -40 H-55 L-35 -12" fill="#fff" stroke="' + m + '" stroke-width="6" stroke-linejoin="round"/>',
        "</g>",
        '<rect x="-80" y="-18" width="120" height="76" rx="16" fill="#fff" stroke="' + m + '" stroke-width="6"/>',
        '<text x="-20" y="42" text-anchor="middle" font-size="60" font-weight="700" fill="' + m + '">0%</text>',
      ].join("");
  }
  return "";
}

function buildSvg(item) {
  var cat = data.CATEGORIES[item.cat];
  var c = COLORS[item.cat];
  var out = [];
  out.push('<svg xmlns="http://www.w3.org/2000/svg" width="' + SIZE + '" height="' + SIZE + '" viewBox="0 0 ' + SIZE + " " + SIZE + '" font-family="' + FONT + '">');
  out.push('<rect width="100%" height="100%" fill="' + c.bg + '"/>');
  out.push('<rect x="40" y="40" width="1000" height="1000" rx="36" fill="#fff"/>');
  out.push('<rect x="40" y="40" width="1000" height="16" rx="8" fill="' + c.main + '"/>');

  // 見出し
  out.push('<text x="96" y="132" font-size="36" font-weight="700" fill="' + c.main + '">今日の消費税区分</text>');

  // 項目名（最大2行）
  // 長い名前は文字を小さくして3行まで
  var long = textWidth(item.name) > 26;
  var nameSize = long ? 54 : 68;
  var nameLines = long ? wrap(item.name, 16, 3) : wrap(item.name, 13, 2);
  var y = 240;
  nameLines.forEach(function (line) {
    out.push('<text x="96" y="' + y + '" font-size="' + nameSize + '" font-weight="700" fill="#1f2937">' + esc(line) + "</text>");
    y += nameSize + 18;
  });

  // 区分のバッジ
  var badgeY = y + 4;
  var badgeText = cat.label;
  var badgeW = Math.round(textWidth(badgeText) * 46 + 72);
  out.push('<rect x="96" y="' + badgeY + '" width="' + badgeW + '" height="84" rx="42" fill="' + c.main + '"/>');
  out.push('<text x="' + (96 + badgeW / 2) + '" y="' + (badgeY + 58) + '" text-anchor="middle" font-size="46" font-weight="700" fill="#fff">' + esc(badgeText) + "</text>");

  // 挿絵（バッジの上端から区切り線の手前まで、右側に収める）
  var top = badgeY;
  var bottom = 690;
  var scale = Math.min(0.85, (bottom - top) / 330);
  out.push('<g transform="translate(800 ' + (top + bottom) / 2 + ") scale(" + scale.toFixed(3) + ')">' + illustration(item.cat, c) + "</g>");

  // 勘定科目
  var ay = badgeY + 150;
  out.push('<text x="96" y="' + ay + '" font-size="30" font-weight="700" fill="#6b7280">主な勘定科目</text>');
  wrap(item.accounts.join("、"), 14, 2).forEach(function (line, i) {
    out.push('<text x="96" y="' + (ay + 50 + i * 46) + '" font-size="38" fill="#1f2937">' + esc(line) + "</text>");
  });

  // 具体例（最大3件）
  var ey = 760;
  out.push('<rect x="96" y="' + (ey - 52) + '" width="888" height="2" fill="' + c.soft + '"/>');
  out.push('<text x="96" y="' + ey + '" font-size="30" font-weight="700" fill="#6b7280">具体例</text>');
  (item.examples || []).slice(0, 3).forEach(function (ex, i) {
    var line = wrap(ex, 22, 1)[0];
    var ly = ey + 54 + i * 54;
    out.push('<circle cx="112" cy="' + (ly - 13) + '" r="8" fill="' + c.main + '"/>');
    out.push('<text x="136" y="' + ly + '" font-size="38" fill="#1f2937">' + esc(line) + "</text>");
  });

  // フッター
  out.push('<text x="984" y="1010" text-anchor="end" font-size="28" font-weight="700" fill="' + c.main + '">消費税区分辞書</text>');
  out.push("</svg>");
  return out.join("\n");
}

function renderPng(svg, outFile) {
  var tmp = outFile.replace(/\.png$/, "") + ".svg";
  fs.writeFileSync(tmp, svg);
  childProcess.execFileSync("rsvg-convert", ["-w", String(SIZE), "-h", String(SIZE), "-o", outFile, tmp]);
  fs.unlinkSync(tmp);
}

function main() {
  var post = require("./facebook-post.js");
  var args = process.argv.slice(2);
  var outFile = args.filter(function (a) { return a.indexOf("--") !== 0; })[0];
  var dateArg = args.filter(function (a) { return a.indexOf("--date=") === 0; })[0];
  if (!outFile) {
    console.error("usage: node scripts/facebook-image.js <out.png|out.svg> [--date=YYYY-MM-DD]");
    process.exit(2);
  }
  var date = dateArg ? new Date(dateArg.slice(7) + "T12:00:00+09:00") : new Date();
  var item = post.pickItem(date);
  var svg = buildSvg(item);
  if (/\.svg$/.test(outFile)) fs.writeFileSync(outFile, svg);
  else renderPng(svg, outFile);
  console.log(outFile + " (" + item.name + ")");
}

if (require.main === module) main();

module.exports = { buildSvg: buildSvg, renderPng: renderPng, wrap: wrap };
