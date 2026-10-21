#!/usr/bin/env node
/*
 * fetch-kani.js で保存した国税庁ホームページのHTMLから js/kani.js（簡易課税の事業区分）を生成する。
 *
 *   node scripts/build-kani.js <保存先ディレクトリ> [出力ファイル=js/kani.js]
 *
 * 取り込む内容:
 *   - タックスアンサー No.6509 … 各事業区分の意義（表）と判定の留意点
 *   - タックスアンサー No.6517 … 卸売業（第1種）の具体例
 *   - 質疑応答事例 20-03〜20-09 … 日本標準産業分類からみた事業区分（業種ごとの区分と留意事項）
 *   - 質疑応答事例（個別事例）… CASES に区分を指定したもの
 *
 * HTMLは信頼できないデータとして扱い、正規表現でテキストを抜き出すだけにする
 * （スクリプトの実行やDOMへの挿入はしない）。
 */
"use strict";

var fs = require("fs");
var path = require("path");
var yomi = require("./kani-yomi.js").yomi;

var BASE = "https://www.nta.go.jp";
var TA = "/taxes/shiraberu/taxanswer/shohi/";
var QA = "/law/shitsugi/shohi/20/";

// 個別事例の事業区分（回答要旨の結論。理由の中で触れているだけの区分は含めない）
var CASES = {
  "11": [1, 2], // デパートのテナント（商品販売契約なら卸売、手数料契約なら小売）
  "12": [4, 5], // 飲食店のサービス料等は第4種、宴会の花代等は第5種
  "13": [5], // プロスポーツ選手
  "15": [5], // クリーニング業・自動車修理業
  "16": [3, 4], // 製造小売（第3種）と喫茶店（第4種）の兼業
};

// 検索用の別名（本辞書で追加。国税庁の資料の内容ではない）。日本標準産業分類の小分類名 → 日常の言い方
var KEYWORDS = {
  "耕種農業": ["農家", "米", "野菜", "果物"],
  "畜産農業": ["酪農", "畜産", "養鶏"],
  "海面漁業": ["漁師"],
  "園芸サービス業": ["植木", "庭師", "剪定"],
  "木造建築工事業": ["工務店"],
  "パン・菓子製造業": ["ケーキ", "洋菓子", "和菓子", "パン屋", "ケーキ屋"],
  "建築リフォーム工事業": ["リフォーム", "改装"],
  "ソフトウェア業": ["システム開発", "アプリ開発", "プログラミング"],
  "インターネット附随サービス業": ["ウェブサービス", "ネットサービス"],
  "一般乗合旅客自動車運送業": ["バス"],
  "一般乗用旅客自動車運送業": ["タクシー", "ハイヤー"],
  "一般貨物自動車運送業": ["運送業", "トラック", "引越し"],
  "貨物軽自動車運送業": ["軽貨物", "宅配", "配送"],
  "建物売買業、土地売買業": ["不動産売買"],
  "不動産代理業・仲介業": ["不動産仲介", "仲介手数料", "不動産屋"],
  "不動産賃貸業(貸家業、貸間業を除く)": ["店舗の賃貸", "事務所の賃貸", "テナント"],
  "貸家業、貸間業": ["アパート", "マンション", "家賃"],
  "駐車場業": ["月極駐車場", "コインパーキング"],
  "自動車賃貸業": ["レンタカー", "カーリース"],
  "スポーツ・娯楽用品賃貸業": ["レンタル"],
  "法律事務所、特許事務所": ["弁護士", "弁理士"],
  "公認会計士事務所、税理士事務所": ["税理士", "会計事務所"],
  "デザイン業": ["デザイナー", "グラフィックデザイン"],
  "広告業": ["広告代理店"],
  "獣医業": ["動物病院"],
  "写真業": ["カメラマン", "写真撮影"],
  "旅館、ホテル": ["宿泊", "民宿"],
  "専門料理店": ["ラーメン", "焼肉", "中華料理"],
  "すし店": ["寿司"],
  "酒場、ビヤホール": ["居酒屋"],
  "バー、キャバレー、ナイトクラブ": ["スナック"],
  "喫茶店": ["カフェ"],
  "持ち帰り飲食サービス業": ["テイクアウト", "弁当"],
  "配達飲食サービス業": ["デリバリー", "宅配", "仕出し"],
  "洗濯業": ["クリーニング", "コインランドリー"],
  "理容業": ["床屋", "理髪", "ヘアカット"],
  "美容業": ["美容院", "美容室", "ヘアサロン"],
  "その他の洗濯・理容・美容・浴場業": ["ネイル", "エステ"],
  "旅行業": ["旅行代理店"],
  "家事サービス業": ["家事代行"],
  "冠婚葬祭業": ["葬儀", "結婚式"],
  "他に分類されない生活関連サービス業": ["ペット美容", "トリミング"],
  "スポーツ施設提供業": ["ジム", "フィットネス", "ゴルフ場"],
  "遊戯場": ["ゲームセンター", "カラオケ"],
  "学習塾": ["塾", "家庭教師"],
  "教養・技能教授業": ["習い事", "ピアノ教室", "英会話", "ヨガ"],
  "一般診療所": ["クリニック", "医院"],
  "歯科診療所": ["歯医者"],
  "療術業": ["整体", "整骨院", "接骨院", "マッサージ", "鍼灸"],
  "老人福祉・介護事業": ["介護"],
  "自動車整備業": ["車検", "自動車修理"],
  "機械修理業(電気機械器具を除く)": ["修理"],
  "労働者派遣業": ["人材派遣"],
  "建物サービス業": ["ビル清掃", "清掃"],
  "警備業": ["ガードマン"],
};

var PAGES = [{ path: TA + "6509.htm", kind: "types" }, { path: TA + "6517.htm", kind: "wholesale" }]
  .concat(
    ["03", "04", "05", "06", "07", "08", "09"].map(function (n) {
      return { path: QA + n + ".htm", kind: "industry" };
    })
  )
  .concat(
    Object.keys(CASES).map(function (n) {
      return { path: QA + n + ".htm", kind: "case", types: CASES[n] };
    })
  );

if (require.main !== module) {
  module.exports = { PAGES: PAGES };
  return;
}

var SUMMARY_LEN = 220;
var KANJI = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, "1": 1, "2": 2, "3": 3, "4": 4, "5": 5, "6": 6 };

var dir = process.argv[2];
var outFile = process.argv[3] || path.join(__dirname, "..", "js", "kani.js");
if (!dir) {
  console.error("usage: node scripts/build-kani.js <htmlDir> [outFile]");
  process.exit(2);
}

function read(urlPath) {
  var file = path.join(dir, urlPath.replace(/^\//, "").replace(/\//g, "_"));
  if (!fs.existsSync(file)) throw new Error("HTML未取得: " + urlPath + "（先に fetch-kani.js を実行）");
  var buf = fs.readFileSync(file);
  var head = buf.slice(0, 2048).toString("latin1");
  var enc = /charset=["']?shift_jis/i.test(head) ? "shift_jis" : "utf-8";
  return new TextDecoder(enc).decode(buf);
}

var ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", emsp: " ", ensp: " ", thinsp: " " };

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
      return ENTITIES[e.toLowerCase()] || m;
    })
    .replace(/[\s　]+/g, " ")
    .trim();
}

function clip(str) {
  return str.length <= SUMMARY_LEN ? str : str.slice(0, SUMMARY_LEN) + "…";
}

function title(html) {
  var m = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html);
  return m ? text(m[1]) : "";
}

function paragraphs(html) {
  var out = [];
  var re = /<p[^>]*>([\s\S]*?)<\/p>/gi;
  var m;
  while ((m = re.exec(html))) {
    var t = text(m[1]);
    if (t) out.push(t);
  }
  return out;
}

// 文中に出てくる事業区分（第一種事業〜第六種事業・第1種事業〜第6種事業）
function typesIn(str) {
  var found = [];
  var re = /第([一二三四五六1-6])種事業/g;
  var m;
  while ((m = re.exec(str))) {
    var n = KANJI[m[1]];
    if (found.indexOf(n) < 0) found.push(n);
  }
  return found.sort();
}

var sources = [];
function addSource(urlPath, html) {
  sources.push({ title: title(html), url: BASE + urlPath });
  return sources.length - 1;
}

var TYPES = {};
var entries = [];
var usedKeywords = {};

/* ---------- No.6509：事業区分の意義と留意点 ---------- */
function buildTypes(page, html, src) {
  var table = /<caption[^>]*>簡易課税制度の事業区分の表<\/caption>([\s\S]*?)<\/table>/i.exec(html);
  if (!table) throw new Error("No.6509 の事業区分の表が見つかりません");
  var rowRe = /<th scope="row">第(\d)種事業<\/th>[\s\S]*?<td[^>]*>[\s\S]*?<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>/gi;
  var m;
  while ((m = rowRe.exec(table[1]))) TYPES[m[1]] = { def: text(m[2]), points: [] };

  // 表の後の「第N種事業」見出しごとの留意点。イ・ロ…の列挙は具体例として entries にも入れる
  var rest = html.slice(html.indexOf(table[0]) + table[0].length);
  var end = rest.search(/<h2>根拠法令等/);
  if (end >= 0) rest = rest.slice(0, end);
  var sections = rest.split(/<h3>/i).slice(1);
  sections.forEach(function (sec) {
    var h = /^第(\d)種事業<\/h3>/.exec(sec);
    if (!h) return;
    var n = Number(h[1]);
    paragraphs(sec).forEach(function (p) {
      var item = /^([イロハニホ])\s*(.+)$/.exec(p);
      if (!item) {
        TYPES[n].points.push(p);
        return;
      }
      if (n === 5) {
        // 第5種の見出しの下のイ・ロは「サービス業から除かれる飲食店業に該当するもの」＝第4種の例
        entries.push({ k: "e", t: [4], text: "飲食店業に該当するもの：" + item[2].trim(), src: src });
      } else {
        TYPES[n].points.push(p);
        entries.push({ k: "e", t: [n], text: item[2].trim(), src: src });
      }
    });
  });
  for (var i = 1; i <= 6; i++) if (!TYPES[i]) throw new Error("No.6509 に第" + i + "種事業の定義がありません");
}

/* ---------- No.6517：卸売業の具体例 ---------- */
function buildWholesale(page, html, src) {
  var start = html.search(/<h2>具体例<\/h2>/);
  if (start < 0) throw new Error("No.6517 の具体例が見つかりません");
  var body = html.slice(start);
  body = body.slice(0, body.search(/<h2>根拠法令等/));
  var ps = paragraphs(body);
  var current = null;
  var inNote = false;
  ps.forEach(function (p) {
    var num = /^(\d)\s+(.+)$/.exec(p);
    var paren = /^（(\d)）(.+)$/.exec(p);
    if (/^（注）/.test(p)) {
      inNote = true;
      current = null;
    } else if (num && !inNote) {
      current = { k: "e", t: [1], text: num[2], src: src };
      entries.push(current);
    } else if (paren && inNote) {
      entries.push({ k: "e", t: [1], text: "「性質や形状を変えない」行為の例：" + paren[2], src: src });
    } else if (current && /^例えば/.test(p)) {
      current.text += "（" + p.replace(/。$/, "") + "）";
    }
  });
}

/* ---------- 20-03〜20-09：日本標準産業分類からみた事業区分 ---------- */
function cellsOf(rowHtml) {
  var out = [];
  var re = /<td([^>]*)>([\s\S]*?)<\/td>/gi;
  var m;
  while ((m = re.exec(rowHtml))) {
    var span = /rowspan="(\d+)"/i.exec(m[1]);
    out.push({ html: m[2], rowspan: span ? Number(span[1]) : 1 });
  }
  return out;
}

// 留意事項の文と、文に続く〔例〕の箇条（<li>）。箇条は直前の文の例として { text, parent } で返す
function noteSentences(html) {
  var out = [];
  var parent = null;
  var re = /<(p|li)[^>]*>([\s\S]*?)<\/\1>/gi;
  var m;
  var any = false;
  while ((m = re.exec(html))) {
    any = true;
    var t = text(m[2]).replace(/^[○◯]\s*/, "").trim();
    if (!t || /^〔例〕$/.test(t)) continue;
    if (m[1].toLowerCase() === "li") {
      out.push({ text: t, parent: parent });
    } else {
      parent = t;
      out.push({ text: t, parent: null });
    }
  }
  if (!any) {
    var whole = text(html);
    if (whole) out.push({ text: whole, parent: null });
  }
  return out;
}

// 大分類 A（農業、林業）・B（漁業）：飲食料品の譲渡に係る部分は第2種（令和元年10月1日の属する課税期間から）
var FOOD_MAJOR = /^[AB]－/;

function buildIndustry(page, html, src) {
  // 表の前の（注）のうち、飲食料品の譲渡の事業区分に関するもの（農林水産業は第二種事業になる旨）
  var intro = html.slice(Math.max(0, html.indexOf("【回答要旨】")), html.search(/大分類【/));
  var noteRe = /<li[^>]*>([\s\S]*?)<\/li>/gi;
  var nm;
  while ((nm = noteRe.exec(intro))) {
    var nt = text(nm[1]).replace(/^\d+\s*/, "");
    if (/飲食料品/.test(nt) && typesIn(nt).length) entries.push({ k: "n", t: typesIn(nt), text: nt, src: src });
  }

  var majorRe = /大分類【([^】]+)】/g;
  var marks = [];
  var m;
  while ((m = majorRe.exec(html))) marks.push({ pos: m.index, name: m[1] });
  var tableRe = /<table[\s\S]*?<\/table>/gi;
  var count = 0;
  while ((m = tableRe.exec(html))) {
    var major = null;
    marks.forEach(function (mk) {
      if (mk.pos < m.index) major = mk.name;
    });
    if (!major) continue;
    var carry = []; // 列ごとの rowspan 持ち越し { cell, left }
    var lastMiddle = "";
    var rows = m[0].split(/<tr[\s>]/i).slice(1);
    rows.forEach(function (row) {
      row = row.split(/<\/tr>/i)[0];
      var cells = cellsOf(row);
      if (!cells.length) return; // 見出し行
      var grid = [];
      var fresh = [];
      for (var col = 0; col < 4; col++) {
        if (carry[col] && carry[col].left > 0) {
          grid[col] = carry[col].cell;
          fresh[col] = false;
          carry[col].left--;
        } else {
          var c = cells.shift();
          if (!c) throw new Error(page.path + ": 列数が足りない行があります");
          grid[col] = c;
          fresh[col] = true;
          carry[col] = { cell: c, left: c.rowspan - 1 };
        }
      }
      if (cells.length) throw new Error(page.path + ": 列数が多すぎる行があります");
      // 中分類の欄は rowspan のほか、罫線を消した空欄で前の行と結合していることがある
      var middle = text(grid[0].html) || lastMiddle;
      lastMiddle = middle;
      // 小分類は <br> 区切りと空白区切り（「…〔301〕 …〔302〕」）が混在する
      var minors = grid[1].html
        .split(/<br\s*\/?>/i)
        .map(text)
        .join(" ")
        .split(/(?<=〕)\s+/)
        .map(function (s) { return s.trim(); })
        .filter(Boolean);
      var typeText = text(grid[2].html).replace(/\s+/g, "");
      var types = typesIn(typeText);
      if (!types.length) throw new Error(page.path + ": 事業区分を読み取れません: " + typeText);
      var base = { maj: major, mid: middle, min: minors, src: src };
      var industry = Object.assign({ k: "i", t: types, approx: /おおむね/.test(typeText) }, base);
      if (FOOD_MAJOR.test(major) && types.indexOf(3) >= 0) {
        industry.t = [2].concat(types);
        industry.food = true;
      }
      var kw = [];
      minors.forEach(function (name) {
        var key = name.replace(/〔\d+〕$/, "");
        if (KEYWORDS[key]) {
          kw = kw.concat(KEYWORDS[key]);
          usedKeywords[key] = true;
        }
      });
      if (kw.length) industry.kw = kw;
      // ひらがなでも探せるよう、業種名・中分類・別名のよみを付ける（読めない漢字があればここで止まる）
      var readings = [];
      minors.concat([middle], kw).forEach(function (name) {
        var plain = name.replace(/\s*〔\d+〕/g, "").trim();
        var r = yomi(plain);
        if (r !== plain && readings.indexOf(r) < 0) readings.push(r);
      });
      if (readings.length) industry.yomi = readings;
      industry.majYomi = yomi(major.replace(/^[A-Z]－?/, ""));
      entries.push(industry);
      count++;
      if (!fresh[3]) return; // 留意事項が前の行から持ち越しのときは重複させない
      noteSentences(grid[3].html).forEach(function (s) {
        // 例の区分は、例を挙げている文の区分（文に区分がなければその業種の区分）
        var t = typesIn(s.parent || s.text);
        var entry = Object.assign({ k: "n", t: t.length ? t : types, text: s.text }, base);
        if (s.parent) entry.of = s.parent;
        entries.push(entry);
      });
    });
  }
  if (!count) throw new Error(page.path + ": 業種の表が見つかりません");
}

/* ---------- 個別事例 ---------- */
function buildCase(page, html, src) {
  var start = html.indexOf("【回答要旨】");
  var end = html.indexOf("【関係法令通達】");
  if (start < 0) throw new Error(page.path + ": 回答要旨が見つかりません");
  var answer = text(html.slice(start + "【回答要旨】".length, end > start ? end : undefined))
    .replace(/^[^ぁ-んァ-ヶ一-龠0-9０-９(（]+/, "")
    .trim();
  // 結論だけを残す：理由の前で切り、「したがって、」で結論を述べている場合はそこから
  answer = answer.split(/\s*[(（](理由|注)[)）]/)[0];
  var therefore = answer.indexOf("したがって、");
  if (therefore > 0) answer = answer.slice(therefore + "したがって、".length);
  entries.push({ k: "c", t: page.types.slice(), title: title(html), text: clip(answer), src: src });
}

var BUILDERS = { types: buildTypes, wholesale: buildWholesale, industry: buildIndustry, case: buildCase };
var fetchedAt = "";
try {
  fetchedAt = JSON.parse(fs.readFileSync(path.join(dir, "_fetch.json"), "utf8")).fetchedAt.slice(0, 10);
} catch (e) {
  fetchedAt = new Date().toISOString().slice(0, 10);
}

PAGES.forEach(function (page) {
  var html = read(page.path);
  BUILDERS[page.kind](page, html, addSource(page.path, html));
});

var unused = Object.keys(KEYWORDS).filter(function (key) {
  return !usedKeywords[key];
});
if (unused.length) throw new Error("KEYWORDS の小分類名が見つかりません: " + unused.join("、"));

var src =
  "/*\n" +
  " * 簡易課税制度の事業区分（自動生成。手で編集しない）\n" +
  " *   node scripts/build-kani.js で生成。出典は SOURCES の国税庁ホームページ。\n" +
  " *\n" +
  " * TYPES[区分]  : def（No.6509 の「該当する事業」）・points（判定の留意点）\n" +
  " * ENTRIES      : k = i（業種：日本標準産業分類）/ n（業種の留意事項）/ e（具体例）/ c（質疑応答の個別事例）\n" +
  " *                t = 該当する区分の配列、approx = 「おおむね」、maj/mid/min = 大・中・小分類、src = SOURCES の添字\n" +
  " *                of = 留意事項の〔例〕の場合、例を挙げている文\n" +
  " *                food = 農林水産業で、飲食料品の譲渡に係る部分は第2種・それ以外は第3種\n" +
  " *                yomi = 業種名・中分類・別名のよみ（scripts/kani-yomi.js の読み方辞書で作る。ひらがな検索用）\n" +
  " *                majYomi = 大分類名のよみ\n" +
  " *                kw = 検索用の別名（本辞書で追加したもの。国税庁の資料の内容ではない）\n" +
  " */\n" +
  "(function (root) {\n" +
  '  "use strict";\n\n' +
  "  var FETCHED_AT = " + JSON.stringify(fetchedAt) + ";\n\n" +
  "  var SOURCES = [\n" +
  sources.map(function (s) { return "    " + JSON.stringify(s); }).join(",\n") +
  "\n  ];\n\n" +
  "  var TYPES = " + JSON.stringify(TYPES, null, 2).replace(/\n/g, "\n  ") + ";\n\n" +
  "  var ENTRIES = [\n" +
  entries.map(function (e) { return "    " + JSON.stringify(e); }).join(",\n") +
  "\n  ];\n\n" +
  "  var api = { FETCHED_AT: FETCHED_AT, SOURCES: SOURCES, TYPES: TYPES, ENTRIES: ENTRIES };\n\n" +
  '  if (typeof module !== "undefined" && module.exports) {\n' +
  "    module.exports = api;\n" +
  "  } else {\n" +
  "    root.KANI_DATA = api;\n" +
  "  }\n" +
  '})(typeof self !== "undefined" ? self : this);\n';

fs.writeFileSync(outFile, src);

var byType = {};
entries.forEach(function (e) {
  e.t.forEach(function (n) {
    byType[n] = (byType[n] || 0) + 1;
  });
});
console.log("生成: " + outFile + "（" + entries.length + " 件）");
console.log(
  Object.keys(byType)
    .map(function (n) { return "第" + n + "種 " + byType[n] + " 件"; })
    .join(" / ")
);
