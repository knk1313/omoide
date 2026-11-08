# 開発の進め方

issueで方針を決めてから実装し、一つの変更を一つのコミット（またはPR）にまとめる。

## issue

- 新しい機能や仕様の変更は、実装の前にissueで方針を決める
- タイトルには種別のprefixを付ける（例：`feat: パネルごとのサムネイルを生成する`）
- 本文は`.github/ISSUE_TEMPLATE/`のテンプレートに沿って書く。機能追加は「機能追加」、不具合は「バグ修正」を使う
- 作業の終わりが分かるよう、「提案する機能」に完了条件を書く
- マイルストーンで段階を管理する（M1：CLI、M2：Mac側サーバー、M3：スマホUI、M4：配布）

## prefix

コミットメッセージ、issueとPRのタイトルには、[Conventional Commits](https://www.conventionalcommits.org/ja/v1.0.0/)の種別を付ける。

| prefix | 使う場面 |
| --- | --- |
| `feat` | 機能の追加 |
| `fix` | 不具合の修正 |
| `refactor` | 動作を変えないコードの整理 |
| `perf` | 性能の改善 |
| `test` | テストの追加・修正、実動画での検証 |
| `docs` | ドキュメントだけの変更 |
| `ci` | CIの設定の変更 |
| `build` | パッケージングと配布 |
| `chore` | 上のどれにも当たらない雑務（`.gitignore`の変更など） |

互換性を壊す変更には、`feat!:`のように`!`を付ける。

## コミット

- メッセージは日本語で書き、prefixの後に「何をするか」を一文で書く（例：`feat: 3 段のカードを検出し、中身のあるパネルだけを切り出す`）
- 一つのコミットに複数の種別の変更を混ぜない
- 各コミットの時点でテストが通る状態にする

## ブランチとPR

- `main`は常に動く状態に保つ
- 作業ブランチの名前は`feat/xxx`、`fix/xxx`のように種別で始める
- PRは`.github/pull_request_template.md`に沿って書き、閉じるissueを`close #番号`で示す
- UIを変えたときは、スクリーンショットを付ける

## テスト

Pythonのテストは標準ライブラリの`unittest`で書く。テストだけで使う依存（`httpx`など）は`requirements-dev.txt`に書く。

```bash
.venv/bin/pip install -r requirements-dev.txt
.venv/bin/python -m unittest discover -s tests
```

- 実行にFFmpegが必要なテストには`unittest.skipIf(shutil.which("ffmpeg") is None, ...)`を付ける
- テスト用の動画は、`ffmpeg`の`lavfi`入力（`color`、`testsrc`など）を使ってテストの中で生成する。実動画はリポジトリに入れない
- 実動画での確認は`input/`に置いて行う。`input/`と`output/`の中身はGitの管理外にする
- 判定のしきい値を変えたときは、実動画で見つかった失敗のケースを、生成した動画か`numpy`の配列でテストに再現する

`web/`のチェックとビルドは、`web/`で`npm run check`と`npm run build`を実行する。

## CI

GitHub Actionsが、pushとPRのたびに次の二つのワークフローを実行する。それぞれ、関係するファイルが変わったときだけ動く。

| ワークフロー | 実行する内容 | 動く条件 |
| --- | --- | --- |
| `.github/workflows/python.yml` | FFmpegを入れ、`.python-version`のPythonで`tests/`の`unittest`を実行する | `setlog_join/`、`tests/`、`main.py`、`requirements.txt`、`requirements-dev.txt`、`.python-version`の変更 |
| `.github/workflows/web.yml` | `web/`で`npm run check`と`npm run build`を実行する | `web/`の変更 |

- どちらも、ワークフロー自身のファイルを変えたときにも動く
- `docs/`やREADMEだけの変更では、どちらも動かない
- `web/node_modules`はキャッシュし、`package-lock.json`と`.nvmrc`が変わったときだけ`npm ci`を実行する
- PRに続けてpushしたときは、前の実行を止める。`main`へのpushは止めない
- 新しいPythonのファイルやフォルダを足したときは、`python.yml`の`paths`に加える
- Pythonのバージョンを変えるときは`.python-version`を書き換える

## 出典

- [Conventional Commits 1.0.0](https://www.conventionalcommits.org/ja/v1.0.0/)
