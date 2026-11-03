# スマホ向けUIと動画再生

UIはiPhoneのSafariとAndroidのChromeの現行版を対象にし、片手で操作できることを優先する。

## 画面の作り

- タップできる要素は、44×44pt以上にする（Appleの指針）。WCAG 2.2の最低基準は24×24 CSS pxだが、omoideではAppleの44ptに合わせる
- 文字は11pt以上にし、拡大しなくても読めるようにする
- 横スクロールやピンチでの拡大をしなくても、主な内容が見えるようにする
- 操作の対象の近くにボタンを置く。選択画面の「プレビューへ」は画面の下に固定する
- 文字と背景のコントラスト比を4.5:1以上にする（WCAG 2.2 SC 1.4.3）
- 画像は縦横比を保って表示する
- 色だけで状態を伝えない。採用・除外は、チェックの印と文言でも示す

## 縦位置のそろえ方

- アイコンと1行の文字を横に並べるときは、`flex items-center`で中央にそろえる
- 折り返すことのある文字の前にアイコンを置くときは、アイコンを1行目の高さの箱（`h-[1lh]`）に入れて中央に置く。`mt-0.5`のような数値での調整は、文字の大きさや行の高さを変えるとずれるので使わない
- ボタン・ピル・入力欄の中の文字とアイコンは、箱の中央にそろえる。入力欄の中に置くボタンは、`top-1/2 -translate-y-1/2`で中央に置く

## 状態の持ち方

Reactの状態にするのは、次の三つをすべて満たす値だけにする。

- 時間とともに変わる
- 親の部品から渡されない
- 他の状態や渡された値から計算できない

この方針をomoideに当てはめると、次のようになる。

- 選択数や推定時間は、選択状態から計算し、状態として持たない
- 選択状態は、Mac側の`project.json`を正として持ち、画面はAPIから読み直す。リロードしても選択が残る
- 状態は、それを使う部品の最も近い共通の親に置く

## 動画の再生

- `<video>`要素には`playsinline`を付ける。付けない場合、iPhoneでは再生を始めると全画面表示になる
- 音声のない動画と`muted`の動画は、タップなしで自動再生できる。omoideのクリップは音声を持たないので、一覧での短い再生に使える
- 自動再生の動画は、画面外にスクロールすると止まる
- 動画を配信するAPIは、HTTPのRangeリクエストに対応する。Safariはシークのたびに範囲を指定して取得する

## Rangeリクエストへの対応

- レスポンスに`Accept-Ranges: bytes`を付ける
- 範囲指定のリクエストには、`206 Partial Content`と`Content-Range: bytes 0-1023/146515`の形のヘッダーで返す
- 範囲がファイルの外にあるときは、`416 Range Not Satisfiable`を返す

## 出典

- [Apple：UI Design Dos and Don'ts](https://developer.apple.com/design/tips/)
- [Apple Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines/)
- [W3C：Understanding SC 1.4.3 Contrast (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)
- [W3C：Understanding SC 2.5.8 Target Size (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)
- [WebKit：New `<video>` Policies for iOS](https://webkit.org/blog/6784/new-video-policies-for-ios/)
- [React：Thinking in React](https://react.dev/learn/thinking-in-react)
- [MDN：HTTP range requests](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Range_requests)
