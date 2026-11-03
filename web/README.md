# omoide web

omoideのスマホ向けの画面。Vite、React、TypeScript、Tailwind CSS v4で作る。Mac側のサーバー（`python main.py serve`）がビルド済みのファイルを配信し、画面は[サーバーのAPI](../docs/api.md)だけを使って動く。

## 画面の流れ

共有URLを開いてパスワードでログインした後、次の順に進む。

| URL | 画面 |
| --- | --- |
| `/login` | パスワードの入力 |
| `/` | 使うクリップを選ぶ |
| `/settings` | 速度を選ぶ |
| `/preview` | プレビューを確認し、完成版を保存する |

## 開発

Node.js 24（`.nvmrc`）を使う。

```bash
npm install
npm run dev      # http://localhost:5173
npm run check    # 型チェック、lint、テスト
npm run build    # dist/ に書き出す。serve はこれを配信する
```

`npm run dev`では、`/api`、`/media`、`/download`、`/p/`へのリクエストを`http://127.0.0.1:8080`のサーバーへ渡す。別のアドレスで動かしているときは、`OMOIDE_SERVER`で指定する。

```bash
# Mac側でサーバーを起動しておく（リポジトリのルートで実行する）
.venv/bin/python main.py serve --host 127.0.0.1
# 別のターミナルで
OMOIDE_SERVER=http://127.0.0.1:8080 npm run dev
```

ブラウザで`serve`が表示した共有URLのパス（`/p/<トークン>`）を`http://localhost:5173`に付けて開くと、入場用のCookieが付く。

## 構成

```text
src/
├── api/          # サーバーのAPIの型とクライアント
├── components/   # 画面の外枠と共通の部品（ボタン、カード、モーダルなど）
├── pages/        # 画面
├── app.config.ts # アプリ名と手順
└── index.css     # デザイントークン
```

部品とデザイントークンは[workspace-ui-template](https://github.com/knk1313/workspace-ui-template)から流用した。

## ライセンス

[MIT License](LICENSE)
