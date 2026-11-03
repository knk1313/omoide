# Pythonのコード原則と命名規則

PEP 8を基本にし、判断に迷う点はGoogle Python Style Guideに従う。PEP 8自身が述べるとおり、規約よりもプロジェクト内の一貫性を優先し、プロジェクト内よりもモジュール内の一貫性を優先する。

## 命名

名前の付け方は次のとおり。

| 対象 | 形 | 例 |
| --- | --- | --- |
| パッケージ | 短い小文字 | `setlog_join` |
| モジュール | 短い小文字、必要ならアンダースコア | `segments.py`、`ffmpeg.py` |
| クラス | CapWords（略語は大文字のまま） | `VideoInfo`、`ScannedClip` |
| 関数・変数 | 小文字とアンダースコア | `detect_clips`、`frame_count` |
| 定数 | モジュールの先頭で大文字とアンダースコア | `CLIP_SECONDS`、`PANEL_COUNT` |
| 非公開の関数・定数 | 先頭にアンダースコアを一つ | `_corner_inset`、`_EMPTY_RATIO` |
| 例外クラス | CapWordsで、末尾を`Error`にする | `PanelLayoutError` |

- 型名を変数名に入れない（`clip_list`ではなく`clips`）
- 意味の取りにくい略語を使わない。一文字の名前は、ループの添字（`i`）、`except`の`e`、`with`の`f`に限る
- 単位がある値は、名前に単位を入れる（`window_seconds`、`clip_seconds`）

## 型ヒント

- 公開する関数には、引数と戻り値の型ヒントを必ず付ける
- `None`を取る引数は`Path | None`のように明示する
- 値をまとめるだけのクラスは`@dataclass(frozen=True)`にする（例：`Clip`、`Panel`、`VideoScan`）
- 他の値から計算できるものは、フィールドではなく`@property`で定義する（例：`Clip.duration`）

## 関数とモジュールの分け方

- 関数は小さく、一つのことだけをさせる。40行を超えたら分けられないか検討する
- 計算と入出力を分ける。境界検出の`detect_clips`は、フレーム差分の配列を受け取る純粋な関数にし、FFmpegを呼ぶ`frame_diffs`と分けてある。純粋な関数はFFmpegなしでテストできる
- 外部コマンドの呼び出しは`ffmpeg.py`と`probe.py`に閉じ込める
- CLI（`cli.py`）が受け持つのは、次の三つだけにする
  - 引数の解釈
  - 入力の確認
  - 結果の表示
- 変更できるグローバルな状態を持たない

## 例外

- 素の`except:`と、`except Exception:`での握りつぶしをしない
- `try`の範囲は、例外を出しうる行だけに絞る
- 想定内の失敗（カードを検出できないなど）は、意味のある例外にして呼び出し側で利用者向けの文言に変える
- 前提条件の確認に`assert`を使わない。`assert`は最適化の設定で実行されないことがある

## 引数の既定値

- リストや辞書など、変更できるオブジェクトを既定値にしない。`None`を既定値にし、関数の中で作る

## 外部コマンド

- `subprocess.run`には引数をリストで渡し、`shell=True`を使わない。ファイル名に空白や記号が入っても安全に渡せる
- `check=True`を付け、失敗を例外として扱う

## コメントとdocstring

- コメントとdocstringは日本語で書く
- コメントには「何をしているか」ではなく「なぜそうしているか」を書く（例：「H.264の4:2:0に合わせて偶数にそろえる」）
- 公開する関数で、処理が自明でないものにはdocstringを付ける。例外を送出するときは、そのことを書く

## import

- 標準ライブラリ、サードパーティ、パッケージ内の順に、空行で区切って並べる
- パッケージ内は相対import（`from .probe import VideoInfo`）にする
- `from x import *`を使わない

## 1行の長さ

- PEP 8は79文字を基本にし、チームで合意すれば99文字まで広げてよいとしている。新しいコードは99文字以内を目安にする。既存のコードには99文字を超える行が8行ある（最長118文字）。整形ツールを入れるときに上限を確定し、既存の行も直す

## 出典

- [PEP 8 – Style Guide for Python Code](https://peps.python.org/pep-0008/)
- [Google Python Style Guide](https://google.github.io/styleguide/pyguide.html)。参照した節は2.4、2.5、2.12、3.8、3.16、3.18、3.19
- [subprocess – Security Considerations](https://docs.python.org/3/library/subprocess.html#security-considerations)
