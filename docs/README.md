# 開発用ドキュメント

このディレクトリには、omoideを開発するときに参照する方針と規約を置く。人とAIエージェントの両方が読む前提で書く。

## 文書の一覧

各文書の内容は次のとおり。

| 文書 | 内容 |
| --- | --- |
| [development.md](development.md) | issue・ブランチ・コミット・PR・テストの進め方 |
| [python.md](python.md) | Pythonのコード原則と命名規則 |
| [video.md](video.md) | FFmpegで動画を扱うときの注意点 |
| [security.md](security.md) | ローカルサーバーの認証とセッションの方針 |
| [api.md](api.md) | サーバーのAPIの一覧 |
| [errors.md](errors.md) | エラー処理の方針 |
| [mobile-ui.md](mobile-ui.md) | スマホ向けUIと動画再生の方針 |

## 書き方の方針

- 公式の一次資料（Python公式、Apple、W3C、OWASP、MDN、FFmpeg公式など）を出典にし、各文書の末尾に出典を挙げる
- 出典の内容をそのまま写さず、omoideでどう使うかまで書く
- 規約と既存のコードが食い違うときは、既存のコードとの一貫性を優先し、食い違いをissueに残す
- 日本語の表記は[docs-rules](https://github.com/knk1313/docs-rules)のルールに従う
