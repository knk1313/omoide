# omoide web

omoideのスマホ向けの画面。Vite、React、TypeScript、Tailwind CSS v4で作る。Mac側のサーバー（`python main.py serve`）がビルド済みのファイルを配信し、画面は[サーバーのAPI](../docs/api.md)だけを使って動く。

## 画面の流れ

共有URLを開いてパスワードでログインした後、次の順に進む。

| URL | 画面 |
| --- | --- |
| `/login` | パスワードの入力 |
| `/videos` | 動画を取り込み、撮影日を入力する |
| `/` | 使うクリップを選ぶ |
| `/settings` | 速度を選ぶ |
| `/preview` | プレビューを確認し、完成版を保存する |

## 開発

Node.js 24（`.nvmrc`）を使う。

```bash
npm install
npm run dev      # http://localhost:5173
npm run check    # 型チェック、lint（デザイントークン検査を含む）、テスト（axe・コントラスト検査を含む）
npm run build    # dist/ に書き出す。serve はこれを配信する
npm run test:e2e:install  # 初回のみ: Playwright の Chromium を入れる
npm run test:e2e          # E2E（スマホとデスクトップの 2 幅。表示・操作・axe）
```

`npm run dev`では、`/api`、`/media`、`/download`、`/p/`へのリクエストを`http://127.0.0.1:8080`のサーバーへ渡す。別のアドレスで動かしているときは、`OMOIDE_SERVER`で指定する。

```bash
# Mac側でサーバーを起動しておく（リポジトリのルートで実行する）
.venv/bin/python main.py serve --host 127.0.0.1
# 別のターミナルで
OMOIDE_SERVER=http://127.0.0.1:8080 npm run dev
```

ブラウザで`serve`が表示した共有URLのパス（`/p/<トークン>`）を`http://localhost:5173`に付けて開くと、入場用のCookieが付く。

E2EはMac側のサーバーを使わず、`e2e/mockServer.ts`がAPIの代わりに応える。

## UIのもと

UIは、デジタル庁デザインシステム（DADS）に準拠したテンプレート[workspace-ui-template-dads](https://github.com/knk1313/workspace-ui-template-dads)に基づく。取り込んだのはコミット`feff468fb6ee3d5670e528bc0b3283dd046626fb`で、テンプレートとの差分はこのコミットと比べて追う。

- トークン（`src/tokens/`）、UI部品（`src/components/ui/`）、検査スクリプト（`scripts/check-design-tokens.mjs`）は、テンプレートからコピーした。omoideが使う部品だけを取り込んでいる
- 色・文字の大きさ・寸法は、トークンのユーティリティクラスだけで書く。色コードと任意値クラス（`w-[13px]`など）の直書きは`npm run lint`で検出する
- テンプレートにない部品（`ProgressBar`）と、omoideのために足した機能（`StepNavigation`の`size="sm"`、`NotificationBanner`の`live="assertive"`、上部に出す`Toast`）は、各ファイルの冒頭のコメントに理由を書いた

## 構成

```text
src/
├── api/             # サーバーのAPIの型とクライアント
├── components/
│   ├── ui/          # テンプレートの部品（1部品 = 1ファイル + テスト）
│   └── app/         # omoide固有の部品（動画の再生、読み込み中とエラー、ErrorBoundary）
├── layouts/         # 画面の外枠（ヘッダー・手順）と下部の操作の帯
├── pages/           # 画面（clips/ と preview/ は画面固有の部品とフック）
├── session/         # ログインの状態と、進めないときの案内
├── tokens/          # デザイントークン（テンプレートの primitives・theme・typography と、omoide の app.css）
├── app.config.ts    # アプリ名と手順
└── index.css        # Tailwind・フォント・トークンの読み込み、基本スタイル
e2e/                 # Playwright の E2E とモックの API
scripts/             # デザイントークンの検査
```

## ライセンス

[MIT License](LICENSE)
