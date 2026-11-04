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

UIは、デジタル庁デザインシステム（DADS）準拠のテンプレート[workspace-ui-template-dads](https://github.com/knk1313/workspace-ui-template-dads)をもとにしている。取り込み元のコミットは`5aa88524aca123a3c0e2f8253fdf8e49e75fd039`（0.4.0、ダークモードまで）である。テンプレートの更新を取り込むときは、このコミットとの差分を見る。

- トークン（`src/tokens/`）、UI部品（`src/components/ui/`）、検査スクリプト（`scripts/check-design-tokens.mjs`）は、テンプレートからコピーした。omoideが使う部品だけを取り込んでいる
- E2Eの検査（`e2e/layout.ts`、`e2e/layout.spec.ts`、`e2e/a11y.spec.ts`）は、テンプレートのものをomoideの画面に合わせて使う。整列のずれ、フォーカスの隠れ、400%拡大、文字間隔、見出しの構造、強制カラーモードを確かめる
- 色・文字の大きさ・寸法は、トークンのユーティリティクラスだけで書く。色コードと任意値クラス（`w-[13px]`など）の直書きは`npm run lint`で検出する
- 画面の文言は、テンプレートの文言のルールに従い、和文と半角の英数字の間に空白を入れない（例：`10件を選択`、`Macにつながりません`）

### テンプレートとの違い

omoideはスマホで4つの手順を順に進むアプリなので、管理画面向けのテンプレートと次の点を変えている。コードのコメントから、この節を参照している。

| 違い | 理由 |
| --- | --- |
| サイドバーも上部のナビゲーションも使わず、`ShellHeader`と`StepNavigation`でヘッダーを組む。`ShellHeader.tsx`から`HamburgerButton`を除いた | メニューから選ぶ画面がなく、手順を順に進むため |
| `StepNavigation`に`size="sm"`を足した（丸32px、最小幅なし） | テンプレートの寸法では、390pxの画面で横スクロールになるため |
| 主な操作を、下部に固定した帯（`layouts/BottomBar.tsx`）に置く | どの画面でも主な操作の位置をそろえるため。テンプレートの「フォームの操作ボタンを固定しない」（D-20）とは異なる |
| フォーカスが隠れないよう、`index.css`で下部の帯の高さの分を空ける（`scroll-padding-bottom`） | テンプレートは固定ヘッダーの分を上に空けるが、omoideはヘッダーを固定せず、下部の帯を固定するため |
| `Toast`をスマホでも画面の上に出し、エラーは1件ずつ`role="alert"`にする | 下部の帯と重ねず、エラーをすぐ読み上げるため |
| `NotificationBanner`に`live="assertive"`（`role="alert"`）を足した | 操作の結果のエラーを、すぐ読み上げるため |
| 配色（ライト・ダーク・スマホの設定に合わせる）は、手順とは別の設定画面（`/preferences`、ヘッダーの歯車）で選び、選んだらすぐに反映する | テンプレートは設定画面の「保存」で反映するが、omoideの設定画面は項目が少なく、スマホで1回のタップで切り替えられるほうが分かりやすいため。`/settings`は手順の「速度」で使っている |
| `ProgressBar`を足した | テンプレートにない部品のため。DADSのプログレスインジケーターに従った |
| 再生ボタンをサムネイルの下の行に置く（`pages/clips/ClipTile.tsx`） | 採用の切り替えと再生の当たり判定を重ねないため |
| ログインの失敗は、入力欄の上のエラーのバナーで伝える | 入力欄が1つで、まとめとエラーテキストが同じ文言になるため |
| `disabled`のボタンを残している（採用0件の「次へ」など） | 外すと入力の検査の振る舞いが変わるため。理由は近くの文言で示す |
| `LoadError`の代わりに`components/app/PageStatus.tsx`の`LoadFailure`を使う | 読み込みの失敗を`role="alert"`ですぐ読み上げ、Macのserveを確かめる案内を添えるため |
| 画面の読み込み中と、時間のかかる処理の進み具合に、テンプレートの`Spinner`ではなく、考え中のカメラのアバター（`components/app/BotAvatar.tsx`、[open-bot-avatar](https://github.com/DominikScholz/open-bot-avatar)）を出す。画面の全体が読み込み中のときは、見出し（h1）も出す | 待っている間を親しみやすくするため。アバターは飾りにし、状態は文言（`role="status"`）と進み具合のバーで伝える。色はトークンを実行時に読み、配色の切り替えに合わせる |
| `useUnsavedChangesWarning`を取り込まない | react-routerの`useBlocker`はデータルーター（`createBrowserRouter`）が必要で、omoideは`BrowserRouter`を使うため。アップロード中の離脱は`beforeunload`で確認している |
| 見た目の回帰テスト（スクリーンショットの比較）を取り込まない | Linuxのコンテナでの実行が前提で、omoideのE2Eは数値の検査（整列・フォーカス・はみ出し）とaxeで足りるため |

## 構成

```text
src/
├── api/             # サーバーのAPIの型とクライアント
├── components/
│   ├── ui/          # テンプレートの部品（1部品 = 1ファイル + テスト）
│   └── app/         # omoide固有の部品（動画の再生、待っている間のアバター、読み込み中とエラー、ErrorBoundary）
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

待っている間に出すアバターは、[open-bot-avatar](https://github.com/DominikScholz/open-bot-avatar)（MIT License、Copyright (c) 2026 Dominik Scholz）のライブラリと、ギャラリーのカメラの定義（`gallery/camera.json`）を使っている。
