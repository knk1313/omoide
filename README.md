# omoide

Mac に置いた Setlog の書き出し動画を自動でクリップに分割し、同じ Wi-Fi のスマホから採用するクリップを選んで、結合・速度調整・プレビュー・ダウンロードまで行うローカルファーストなツール。

- **Mac**: 動画の保存・解析・変換・配信（Python + FFmpeg）
- **スマホ**: 編集用の操作・プレビュー端末（ブラウザ、React）

## 使い方

```bash
# 初回のみ (FFmpeg が必要: brew install ffmpeg)
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt

# input/ に Setlog の書き出し動画 (MP4 / MOV) を置いて実行
.venv/bin/python main.py scan            # クリップと中身のあるパネルを一覧表示
.venv/bin/python main.py scan --export   # 中身のあるパネルを output/<動画名>/ に書き出す

# パネルをつないで 1 本の動画にする (output/omoide-<日時>.mp4)
.venv/bin/python main.py join --speed 1.5                     # 中身のあるパネルをすべて使う
.venv/bin/python main.py join --select collection_export/001-1,collection_export/002-3

# 同じ Wi-Fi のスマホから操作するサーバーを起動する (先に画面をビルドしておく: cd web && npm run build)
# 起動するとパスワードを聞かれ、URL と QR コードが表示される。既定では 2 時間で終了する
.venv/bin/python main.py serve --expires 2h
```

- 動画はメタデータの作成日時（無ければファイルの更新日時）で時系列に並べる
- 約 2 秒ごとのクリップ境界を検出する
- 縦に 3 段並んだカードを検出し、余白と角丸を除いて切り出す
- 時刻と zZ だけの空カードは除外する
- `join` は上の人の全クリップ（時系列）→ 中の人 → 下の人の順につなぐ。速度は `0.5` / `1` / `1.5` / `2`

解析結果は `.setlog-join/cache/` に保存し、動画のファイルサイズと更新日時が変わらなければ次回の解析を省く。`scan` は、中身のあるパネルごとのサムネイル（幅 400px の JPEG）も `.setlog-join/thumbnails/` に作る。

`input/`・`output/`・`.setlog-join/` の中身は Git 管理外。

## 構成

```text
.
├── main.py          # CLI の入口
├── setlog_join/     # 動画の解析・切り出し (Python)
├── tests/           # Python のテスト
├── web/             # スマホ向け UI (Vite + React + TypeScript + Tailwind CSS)
├── input/           # 入力動画を置く
└── output/          # 書き出し先
```

```bash
# Python のテスト
.venv/bin/python -m unittest discover -s tests
```

`web/` は [workspace-ui-template](https://github.com/knk1313/workspace-ui-template) をもとにしている。開発方法は [web/README.md](web/README.md) を参照。
