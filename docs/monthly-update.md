# 月次更新の手順

毎月1回、国税庁ホームページの情報が更新されていないかを確認し、更新されていればアプリに反映する。
この手順は、定期実行（Claude のルーティン「消費税区分辞書の月次更新」、毎月15日 8:47（日本時間））からも、手作業からも同じように使う。

公開先は GitLab（プロジェクト `yzf.from.azracing/consumption-tax-dictionary`、公開ページ https://consumption-tax-dictionary-9e56d0.gitlab.io/ ）。
`main` に push すると GitLab CI（`.gitlab-ci.yml`）がテストを実行し、GitLab Pages に公開する。GitHub への公開は当面行わない。

- リポジトリ：`https://gitlab.com/yzf.from.azracing/consumption-tax-dictionary.git`（読み取りは認証なしで可）
- 書き込み：作業環境に保存した gitlab.com の認証情報が、git の通信に自動で付く（トークンをファイルやコマンドに書かない）
- 2026年11月1日の定期実行は、GitHub への push が拒否されて反映できなかった。11月7日に公開先を GitLab に切り替えた

## 対象

| 対象 | 取得・生成 | アプリの場所 |
| --- | --- | --- |
| タックスアンサー・質疑応答事例（一覧・全文） | `scripts/fetch-nta.js` → `scripts/build-nta.js` | 国税庁の記事タブ（`js/nta.js`・`js/nta-body.js`） |
| 消費税法基本通達・取扱通達 | `scripts/fetch-tsutatsu.js` → `scripts/build-tsutatsu.js` | 通達タブ（`js/tsutatsu.js`） |
| インボイス制度の概要・Q&A | `scripts/fetch-invoice.js` → `scripts/build-invoice.js`（pdftotext が必要） | インボイスタブ（`js/invoice.js`） |
| 簡易課税の事業区分 | `scripts/fetch-kani.js` → `scripts/build-kani.js` | 簡易課税タブ（`js/kani.js`） |
| 消費税率引下げ特設サイト | `scripts/check-ratecut.js`（確認のみ） | 税率引下げタブ（`index.html` の `#tab-ratecut`、手で書いた要約） |

こども家庭庁の記事（`js/data.js` の `CFA_ARTICLES`）は対象外（作業環境から cfa.go.jp に接続できないため）。

## 手順

1. GitLab の `main` を最新にして、作業ブランチ `monthly-update-YYYYMM` を作る。
   ```sh
   # リポジトリがなければクローンする（あれば gitlab の remote を確認して fetch）
   git clone https://gitlab.com/yzf.from.azracing/consumption-tax-dictionary.git
   cd consumption-tax-dictionary
   git fetch origin main && git checkout -B monthly-update-YYYYMM origin/main
   ```
2. 取得は毎回**新しい空のディレクトリ**に行う（取得スクリプトは保存済みのファイルを再取得しないため）。
   ```sh
   D=$(mktemp -d)
   node scripts/fetch-nta.js $D/nta && node scripts/build-nta.js $D/nta
   node scripts/fetch-tsutatsu.js $D/tsutatsu && node scripts/build-tsutatsu.js $D/tsutatsu
   node scripts/fetch-invoice.js $D/invoice && node scripts/build-invoice.js $D/invoice
   node scripts/fetch-kani.js $D/kani && node scripts/build-kani.js $D/kani
   ```
   - 取得に失敗した（終了コードが 0 以外、または「失敗 n 件」が出た）データは反映しない。`git checkout -- js/` で戻し、失敗した URL を報告する。
   - 国税庁の目次でコメントアウトされた記事（非公開）は取得・掲載しない。
   - `build-kani.js` が「よみが分からない漢字」で止まった場合は、`scripts/kani-yomi.js` に語と読みを足して再実行する。
3. 変更点を確認する。
   ```sh
   node scripts/report-changes.js        # 「内容の変更：あり／なし」
   node scripts/check-ratecut.js         # 「特設サイトの更新：あり／なし」
   ```
   - データの件数が大きく減った（目安：1割以上）場合は、国税庁のページの構成が変わって取り出しに失敗した可能性が高い。反映せずに報告する。
4. 特設サイトに更新があった場合は、新しい資料（PDF）を読み、税率引下げタブ（`index.html` の `#tab-ratecut`）の該当箇所を書き直す。
   - 冒頭の「特設サイトの最終更新」「確認日」も更新する。
   - 法案の成立など、前提（「法案成立前の改正案です」）が変わった場合は、冒頭の注意書きも直す。
   - 書き直した後に `node scripts/check-ratecut.js --update` で記録を更新する。
   - 期間・税率・対象外の取引が変わった場合は、Facebook投稿の文言（`scripts/facebook-post.js` の `rateCutNote`、`scripts/facebook-image.js` のカードの一文）も合わせて直す。
5. 内容の変更も特設サイトの更新もない場合は、何もコミットせずに「更新なし」と報告して終わる（取得日だけの変更はコミットしない）。
6. 変更がある場合：
   - `npm test` がすべて成功することを確認する。失敗したら原因を直す。直せない場合は反映せずに報告する。
   - README の件数（例：「質疑応答事例『消費税』（272件）」）が変わっていれば直す。
   - 変更点（`node scripts/report-changes.js` の出力の要点）をコミットメッセージに書いてコミットし、作業ブランチを GitLab に push する。
   - GitLab の `main` を fetch し直し、作業ブランチが `main` の先頭から分かれていれば（早送りできれば）`git push origin HEAD:main` で反映する。`main` が先に進んでいた場合は、作業ブランチを `main` に rebase してテストし直してから push する。
   - 反映後、公開ページ（https://consumption-tax-dictionary-9e56d0.gitlab.io/ ）に変更が出るまで待って確認する（GitLab CI のテストと公開に数分かかる）。10分以上たっても反映されない場合は、GitLab の Build → Pipelines の確認が必要と報告する。
   - テストが失敗して直せない場合や、取得の失敗・件数の大幅な減少があった場合は、`main` には反映せず作業ブランチだけを push して報告する。
7. 結果（更新の有無、反映した内容、反映したコミット、公開ページでの確認結果、失敗した取得があればその内容）を日本語で報告する。
