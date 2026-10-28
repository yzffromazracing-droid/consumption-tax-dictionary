# 消費税区分辞書

消費税区分を網羅して直ぐにわかるようにする。

取引・品目・勘定科目から、消費税区分（**課税10% / 軽減8% / 非課税 / 不課税 / 免税**）を調べられるWebアプリです。ビルド不要の静的サイトで、GitHub Pages などにそのまま置けます。

## 機能

- **辞書**：160項目をキーワード検索（ひらがな・カタカナ・全角半角を区別しない、空白区切りでAND検索。そのままの言葉で見つからないときは「の」「を」などの助詞や送りがなで区切って近いものを表示。この検索方法は全タブ共通）。区分・勘定科目で絞り込み。各項目に判定理由と注意点（例外・インボイスの扱いなど）、全項目に具体例、簡易課税の事業区分（売上げの形態ごとに第1種〜第6種とみなし仕入率）、関連する消費税法基本通達へのリンク、さらに内容が対応する国税庁の関連記事へのリンク。
- **税率引下げ**：国税庁「消費税率引下げ特設サイト」の資料（リーフレット・パンフレット・Q&A、令和8年9月）を整理したもの。飲食料品の税率1%（令和9年4月〜令和11年3月、法案成立前の改正案）の税率表、対象品目、適用時期、8%のままの取引、インボイス、各種特例、日程、Q&A一覧、資料へのリンク。内容は手で書いた要約なので、特設サイトの更新に合わせて `index.html` を直す。
- **判定フロー**：「国内取引か」「事業として」「対価を得て」「非課税に該当」「輸出免税」「軽減税率」の順に、はい/いいえで区分を判定。
- **区分の解説**：各区分の意味、非課税取引の一覧（別表第二）、実務上のポイント。
- **簡易課税**：簡易課税制度の事業区分（第1種〜第6種）ごとに、国税庁の資料から集めた業種（日本標準産業分類からみた事業区分）・留意事項・具体例・質疑応答の事例を表示。業種名や取引の内容で検索でき（業種名・留意事項・具体例はひらがなでも可）、区分で絞り込める（タックスアンサー No.6509・6517、質疑応答事例「簡易課税制度」）。
- **通達**：国税庁ホームページの消費税法基本通達（全641項目）と、消費税関係の取扱通達10件（191項目）を、通達番号（例：`5-1-1`）・見出し・本文で検索。基本通達は章、取扱通達は通達ごとに絞り込み、各項目から国税庁の原文を開ける。廃止された取扱通達には「廃止」と表示。
- **国税庁の記事**：国税庁ホームページのタックスアンサー「消費税」（116件）と質疑応答事例「消費税」（272件）の全記事を、番号・タイトル・分類・要旨・本文で検索。種別・分類（国税庁の目次の見出し）で絞り込み。記事を開くと全文（見出し・段落・箇条書き・表）を表示し、国税庁の原文も開ける（図は原文を参照）。
- **こども家庭庁**：こども家庭庁ホームページの消費税関連記事（認可外保育施設の利用料の非課税措置の通知、無償化FAQ、税制改正の概要など6件）へのリンクと、各記事を関連記事にしている辞書項目。
- **インボイス**：インボイス制度の概要（タックスアンサー No.6498・6625・6496・6497 の本文）と、国税庁「インボイス制度に関するQ&A」全171問。Q&Aは問番号（例：`問24`）・見出し・問い・答えで検索、分類で絞り込み、各問の原文（PDF）を開ける。

## 使い方

```sh
npm start        # http://localhost:8000 で起動（python3 の簡易サーバー）
npm test         # データ・検索ロジックのテスト
npm run update-nta  # 国税庁ホームページから記事を再取得して js/nta.js を再生成
npm run update-tsutatsu  # 国税庁ホームページから通達を再取得して js/tsutatsu.js を再生成
npm run update-kani      # 国税庁ホームページから簡易課税の事業区分の資料を再取得して js/kani.js を再生成
npm run update-invoice   # 国税庁ホームページからインボイスの概要・Q&Aを再取得して js/invoice.js を再生成（pdftotext が必要）
node scripts/report-changes.js      # 再取得したデータとコミット済みの版の変更点（Markdown）
node scripts/check-ratecut.js       # 消費税率引下げ特設サイトの更新の有無
```

`index.html` をブラウザで直接開いても動作します。

## 構成

| ファイル | 内容 |
| --- | --- |
| `index.html` | 画面 |
| `css/style.css` | スタイル（ダークモード対応） |
| `js/data.js` | 区分データ（項目の追加・修正はここ。`tsutatsu` に関連する基本通達の番号、`refs` に国税庁の関連記事のURL、`cfaRefs` にこども家庭庁の関連記事のID（記事は `CFA_ARTICLES` に定義）） |
| `js/nta.js` | 国税庁の記事一覧（自動生成。手で編集しない） |
| `js/nta-body.js` | 国税庁の記事の全文（自動生成。記事を開いたとき・検索したときに読み込む） |
| `js/tsutatsu.js` | 消費税法基本通達・取扱通達（自動生成。手で編集しない） |
| `js/kani.js` | 簡易課税の事業区分（自動生成。手で編集しない） |
| `js/invoice.js` | インボイス制度の概要・Q&A（自動生成。手で編集しない） |
| `js/search.js` | 検索ロジック（ブラウザ・Node共通） |
| `js/app.js` | 画面の制御・判定フロー |
| `scripts/fetch-nta.js` | 国税庁ホームページから記事のHTMLを取得（1秒間隔・取得済みはスキップ） |
| `scripts/build-nta.js` | 取得したHTMLから `js/nta.js`（一覧・要旨）と `js/nta-body.js`（全文）を生成 |
| `scripts/fetch-tsutatsu.js` | 国税庁ホームページから通達のHTMLを取得（1秒間隔・取得済みはスキップ） |
| `scripts/build-tsutatsu.js` | 取得したHTMLから `js/tsutatsu.js` を生成 |
| `scripts/fetch-kani.js` | 国税庁ホームページから簡易課税の事業区分の資料（HTML）を取得 |
| `scripts/build-kani.js` | 取得したHTMLから `js/kani.js` を生成（検索用の別名 `KEYWORDS` もここで定義） |
| `scripts/kani-yomi.js` | 業種名・文章のよみを作る読み方辞書（`build-kani.js` から使う。読めない漢字があると生成が止まるので、語を足す） |
| `scripts/report-changes.js` | 再取得したデータとコミット済みの版を比べ、追加・削除・変更を報告 |
| `scripts/check-ratecut.js` | 消費税率引下げ特設サイトの新着情報・PDFを前回確認時（`scripts/ratecut-known.json`）と比べる |
| `docs/monthly-update.md` | 月次更新（国税庁の情報の確認と反映）の手順 |
| `scripts/fetch-invoice.js` | 国税庁ホームページからインボイスの概要（HTML）とQ&A（PDF）を取得 |
| `scripts/build-invoice.js` | 取得したHTML・PDFから `js/invoice.js` を生成（PDFのテキスト抽出に pdftotext を使用） |
| `scripts/facebook-post.js` | 辞書の項目を1日1件Facebookページに投稿（`.github/workflows/facebook-daily.yml` から毎日実行） |
| `scripts/facebook-image.js` | 投稿に添える図解カード（項目名・区分・勘定科目・具体例と区分ごとの挿絵、1080×1080のPNG）を生成（`rsvg-convert` と日本語フォントが必要） |
| `tests/` | `node --test` によるテスト |

## Facebookへの毎日自動投稿

GitHub Actions（`.github/workflows/facebook-daily.yml`）が毎日 8:47（日本時間）に、辞書の項目を1件ずつ図解カードの画像付きでFacebookページへ投稿します（160日で一巡）。画像が作れなかった日は文章だけで投稿します。

1. Facebookページを用意し、Meta for Developers でアプリを作成して `pages_manage_posts` 権限付きの**長期ページアクセストークン**を取得する（個人プロフィールへの投稿はAPIで不可。ページのみ）。
2. リポジトリの Settings → Secrets and variables → Actions に登録する。
   - Secrets：`FB_PAGE_ID`（ページID）、`FB_PAGE_ACCESS_TOKEN`（ページアクセストークン）
   - Variables（任意）：`SITE_URL`（投稿に添えるサイトのURL。未設定なら GitHub Pages の `https://yzffromazracing-droid.github.io/consumption-tax-dictionary/`）
3. Actions タブの「Facebook daily post」→「Run workflow」で `dry_run` にチェックして本文と画像（実行結果の Artifacts の `card`）を確認し、その後チェックなしで実行して投稿を確認する。

手元での確認：`node scripts/facebook-post.js --dry-run --date=2026-10-12`、`node scripts/facebook-image.js card.svg --date=2026-10-12`（SVGならブラウザで開ける）

## 国税庁の記事データ

- 出典：国税庁ホームページ（取得日は `js/nta.js` の `FETCHED_AT` と画面に表示）
- 対象：[タックスアンサー（コード順索引）](https://www.nta.go.jp/taxes/shiraberu/taxanswer/code/index.htm)に掲載の `/taxanswer/shohi/` 配下の全記事と、[質疑応答事例「消費税」目次一覧](https://www.nta.go.jp/law/shitsugi/shohi/01.htm)の全事例。旧URL `taxanswer/shohi/shohi.htm` は現在404のため、コード順索引を使っている。
- 要旨は本文の「概要」または【回答要旨】の冒頭約200字の抜粋。内容は必ず原文で確認すること。
- 2026-10-07 の取得時点で、目次に掲載されているがリンク先が404だった次の2件は収録していない。
  - タックスアンサー No.6950 社会保障と税の一体改革関係
  - 質疑応答事例 18-09 賃料を口座振込により支払う場合の仕入税額控除の適用要件

## 注意

一般的な取扱いをまとめたもので、個別の契約内容や事実関係によって区分が変わることがあります。最終的な判断は国税庁の資料や税理士にご確認ください。

## 通達データ

- 出典：国税庁ホームページ（取得日は `js/tsutatsu.js` の `FETCHED_AT` と画面に表示）
- 基本通達：[消費税法基本通達 目次](https://www.nta.go.jp/law/tsutatsu/kihon/shohi/01.htm)から辿れる全ての節・款のページ。削除済みの番号（「（…により削除）」）と、目次末尾の「令和5年9月30日以前の通達」（旧版）は収録していない。
- 取扱通達：[間接税関係 個別通達目次](https://www.nta.go.jp/law/tsutatsu/kobetsu/kansetsu/syouhi.htm)のうち、件名に「消費税」と「取扱」を含む通達（様式の制定・廃止の通知を除く）。廃止された通達も参考として収録し、`status` に廃止日を入れている。
- 本文は各項目の冒頭約200字の抜粋。注書き・改正経過を含む全文は原文で確認すること。

## インボイスデータ

- 出典：国税庁ホームページ（取得日は `js/invoice.js` の `FETCHED_AT` と画面に表示）
- 概要：タックスアンサー No.6498（適格請求書等保存方式）・No.6625（適格請求書等の記載事項）・No.6496（帳簿及び請求書等の保存）・No.6497（帳簿および請求書等の記載事項）の本文。
- Q&A：[インボイス制度に関するQ&A 目次一覧](https://www.nta.go.jp/taxes/shiraberu/zeimokubetsu/shohi/keigenzeiritsu/qa_invoice_mokuji.htm)の全問。分類・問番号・見出し・問いは目次から、答えは各問のPDFの【答】の冒頭約300字を抜粋。図表・計算例を含む全文は原文で確認すること。

## 月次更新

毎月1回、国税庁ホームページの更新を確認し、更新があれば反映する。手順は [docs/monthly-update.md](docs/monthly-update.md)。
