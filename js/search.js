/*
 * 検索ロジック（ブラウザ・Node 共通）
 */
(function (root) {
  "use strict";

  // 全角英数→半角、カタカナ→ひらがな、小文字化、空白除去
  function normalize(str) {
    if (!str) return "";
    return String(str)
      .normalize("NFKC")
      .toLowerCase()
      .replace(/[ァ-ヶ]/g, function (ch) {
        return String.fromCharCode(ch.charCodeAt(0) - 0x60);
      })
      .replace(/[\s・、。,.\-ー（）()「」]/g, "");
  }

  function splitTerms(query) {
    return String(query || "")
      .normalize("NFKC")
      .split(/\s+/)
      .map(normalize)
      .filter(Boolean);
  }

  // ひらがな（と長音）だけの語か
  function isAllHiragana(str) {
    return /^[\u3041-\u3096ー]+$/.test(str);
  }

  /*
   * 言い方を変えて探すための語と重み。漢字・カタカナ・英数字を含む語は、ひらがなの部分
   * （「の」「を」などの助詞や「売る」「貸す」の送りがな）で区切って内容語だけにする。
   * 重みは語の役割で決める（日本語は「AのB」の B が中心）:
   *   後ろが助詞（を・が・は・に・で 等）か語の終わり … 1（中心の語）
   *   後ろが「の」（「Aの」「Aへの」）         … 0.7（修飾する語）
   *   後ろがその他のひらがな（送りがな）       … 0.3（「支払い」「貸す」の語幹）
   *   ただし「Aの」の後に中心の語がない場合（「家賃の支払い」）は A が中心なので 1
   *   「自動車の修理」→ 自動車 0.7・修理 1、「パンを作って売る」→ パン 1・作 0.3・売 0.3
   * ひらがなだけの語（よみでの検索）はそのまま重み 1。
   */
  var PARTICLE = /^(を|が|は|に|で|と|や|へ|も|から|まで|より)$/;
  var MODIFIER = 0.7;
  function relaxTokens(query) {
    var out = [];
    function add(term, weight) {
      if (!term) return;
      for (var i = 0; i < out.length; i++) {
        if (out[i].term === term) {
          out[i].weight = Math.max(out[i].weight, weight);
          return;
        }
      }
      out.push({ term: term, weight: weight });
    }
    String(query || "")
      .normalize("NFKC")
      .split(/\s+/)
      .forEach(function (part) {
        if (!part) return;
        if (isAllHiragana(part)) return add(normalize(part), 1);
        var pieces = part.split(/([\u3041-\u3096]+)/); // [内容語, ひらがな, 内容語, …]
        for (var i = 0; i < pieces.length; i += 2) {
          var after = pieces[i + 1] || "";
          var weight = !after || PARTICLE.test(after) ? 1 : /の$/.test(after) ? MODIFIER : 0.3;
          add(normalize(pieces[i]), weight);
        }
      });
    // 「Aの」の後に中心の語（重み 1）がなければ A を中心の語にする
    out.forEach(function (t, i) {
      if (t.weight !== MODIFIER) return;
      var headLater = out.slice(i + 1).some(function (u) {
        return u.weight === 1;
      });
      if (!headLater) t.weight = 1;
    });
    return out;
  }

  function relaxTerms(query) {
    return relaxTokens(query).map(function (t) {
      return t.term;
    });
  }

  function sortResults(results) {
    results.sort(function (a, b) {
      return b.score - a.score || a.index - b.index;
    });
    return results.map(function (r) {
      return r.item;
    });
  }

  // すべての語に一致した項目（AND）
  function matchAll(items, terms, score, accept) {
    var results = [];
    items.forEach(function (item, index) {
      if (!accept(item)) return;
      var total = 0;
      for (var i = 0; i < terms.length; i++) {
        var s = score(item, terms[i]);
        if (!s) return;
        total += s;
      }
      results.push({ item: item, score: total, index: index });
    });
    return sortResults(results);
  }

  /*
   * どれかの語に一致した項目（OR）。語ごとに「一致の強さ（名前・関連語での一致ほど高い）＋一致の加点」に
   * 語の重みを掛けて合計し、その順に並べる。1文字の語だけの一致は除く
   */
  var MATCH_BONUS = 20;
  function matchAny(items, tokens, score, accept) {
    var results = [];
    items.forEach(function (item, index) {
      if (!accept(item)) return;
      var total = 0;
      var long = false;
      tokens.forEach(function (t) {
        var s = score(item, t.term);
        if (!s) return;
        total += (s + MATCH_BONUS) * t.weight;
        if (t.term.length >= 2) long = true;
      });
      if (total && (long || tokens.length === 1)) results.push({ item: item, score: total, index: index });
    });
    return sortResults(results);
  }

  /*
   * 共通の検索手順。
   *   1. 入力どおりの語で AND 検索
   *   2. 見つからなければ、助詞・送りがなで区切った内容語のどれかに一致するものを、
   *      一致の強さと一致した語の数の順に（多くの語に強く一致したものほど上）
   * 2 で見つけた結果には approx = true を付ける（画面で「言い方を変えて探した結果」と表示する）。
   */
  function runSearch(items, query, score, accept) {
    var terms = splitTerms(query);
    var results = matchAll(items, terms, score, accept);
    if (results.length || !terms.length) return results;
    results = matchAny(items, relaxTokens(query), score, accept);
    results.approx = results.length > 0;
    return results;
  }

  // 1語に対する項目のスコア（0 = 一致なし）
  function scoreTerm(item, term) {
    var name = normalize(item.name);
    var kana = normalize(item.kana);
    if (name === term || kana === term) return 100;
    if (name.indexOf(term) === 0 || kana.indexOf(term) === 0) return 80;
    if (name.indexOf(term) >= 0 || kana.indexOf(term) >= 0) return 60;
    var i;
    for (i = 0; i < item.keywords.length; i++) {
      var kw = normalize(item.keywords[i]);
      if (kw === term) return 55;
      if (kw.indexOf(term) >= 0) return 45;
    }
    for (i = 0; i < item.accounts.length; i++) {
      if (normalize(item.accounts[i]).indexOf(term) >= 0) return 35;
    }
    var examples = item.examples || [];
    for (i = 0; i < examples.length; i++) {
      if (normalize(examples[i]).indexOf(term) >= 0) return 25;
    }
    if (normalize(item.desc).indexOf(term) >= 0) return 15;
    if (normalize(item.note).indexOf(term) >= 0) return 10;
    return 0;
  }

  /*
   * items を検索する。
   * options.cat     : 区分コードで絞り込み（省略時は全区分）
   * options.account : 勘定科目で絞り込み
   * 空白区切りの複数語は AND 検索。クエリが空なら絞り込みのみ。
   */
  function search(items, query, options) {
    options = options || {};
    return runSearch(items, query, scoreTerm, function (item) {
      if (options.cat && item.cat !== options.cat) return false;
      if (options.account && item.accounts.indexOf(options.account) < 0) return false;
      return true;
    });
  }

  /* ---------- 国税庁の記事 ---------- */

  // 1語に対する記事のスコア（0 = 一致なし）。番号は「No.6201」「6201」どちらでも可
  function scoreArticle(article, term) {
    var no = normalize(article.no);
    var bare = term.replace(/^(no|問)/, "");
    if (bare && (no === bare || no === term)) return 100;
    var title = normalize(article.title);
    if (title === term) return 90;
    if (title.indexOf(term) === 0) return 70;
    if (title.indexOf(term) >= 0) return 60;
    if (bare && no.indexOf(bare) === 0) return 40;
    if (normalize(article.category).indexOf(term) >= 0) return 30;
    if (article.question && normalize(article.question).indexOf(term) >= 0) return 20;
    if (normalize(article.summary).indexOf(term) >= 0) return 15;
    return 0;
  }

  /*
   * 国税庁の記事・通達・Q&Aを検索する（番号・タイトル・分類・問い・要旨）。
   * options.type     : 種別（taxanswer / qa）で絞り込み
   * options.category : 分類で絞り込み
   */
  function searchArticles(articles, query, options) {
    options = options || {};
    return runSearch(articles, query, scoreArticle, function (article) {
      if (options.type && article.type !== options.type) return false;
      if (options.category && article.category !== options.category) return false;
      return true;
    });
  }

  /* ---------- 簡易課税の事業区分 ---------- */

  // 業種名から産業分類番号（〔011〕など）を除く
  function industryName(str) {
    return normalize(String(str || "").replace(/〔\d+〕/g, ""));
  }

  // 1語に対する事業区分の項目のスコア（0 = 一致なし）
  function scoreKani(entry, term) {
    // 業種名で探せるのは業種の項目だけ（留意事項は同じ行の別業種の話のこともあるため本文で探す）
    // よみ（ひらがな）でも業種名として探せる
    var names = entry.k === "i" ? entry.min.concat([entry.mid], entry.yomi || []) : [];
    var best = 0;
    var i;
    for (i = 0; i < names.length; i++) {
      var name = industryName(names[i]);
      if (name === term) best = Math.max(best, 100);
      else if (name.indexOf(term) >= 0) best = Math.max(best, 70);
    }
    if (entry.k === "i") {
      // 大分類名（「D－建設業」など）そのものの検索は上位に出す
      [entry.maj.replace(/^[A-Z]－?/, ""), entry.majYomi || ""].forEach(function (m) {
        var major = normalize(m);
        if (!major) return;
        if (major === term || major === term + "業" || major === term + "ぎょう") best = Math.max(best, 95);
        else if (major.indexOf(term) >= 0) best = Math.max(best, 20);
      });
    }
    if (best) return best;
    var kw = entry.kw || [];
    for (i = 0; i < kw.length; i++) {
      var k = normalize(kw[i]);
      if (k === term) return 90;
      if (k.indexOf(term) >= 0 || term.indexOf(k) >= 0) best = Math.max(best, 55);
    }
    if (best) return best;
    if (entry.title && normalize(entry.title).indexOf(term) >= 0) return 60;
    if (entry.text && normalize(entry.text).indexOf(term) >= 0) return 40;
    if (entry.of && normalize(entry.of).indexOf(term) >= 0) return 15;
    return 0;
  }

  /*
   * 簡易課税の事業区分の項目（業種・留意事項・具体例・事例）を検索する。
   * options.type : 事業区分（1〜6）で絞り込み
   * クエリが空なら元の順序のまま絞り込みのみ。
   */
  function searchKani(entries, query, options) {
    options = options || {};
    var type = options.type ? Number(options.type) : 0;
    return runSearch(entries, query, scoreKani, function (entry) {
      return !type || entry.t.indexOf(type) >= 0;
    });
  }

  var api = { normalize: normalize, relaxTerms: relaxTerms, search: search, searchArticles: searchArticles, searchKani: searchKani };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.TaxSearch = api;
  }
})(typeof self !== "undefined" ? self : this);
