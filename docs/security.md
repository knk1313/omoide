# ローカルサーバーの認証とセッション

omoideのパスワードは、家庭内LANでの誤アクセスを防ぐためのものとして扱う。HTTPで通信するため、通信の盗聴は防げない。公衆Wi-Fiでは使わず、インターネットに公開する場合はHTTPSを必須にする。

## トークンとパスワード

- URLに含めるトークンとセッションIDは、`secrets.token_urlsafe(32)`で作る。`random`モジュールは使わない
- 利用者の入力と秘密の値の比較は、`secrets.compare_digest`で行う。`==`で比べると、比較にかかる時間から攻撃者が値を推測できる
- パスワードは起動時にターミナルで対話入力し、コマンド引数や環境変数では受け取らない。シェルの履歴に残さないためである
- パスワードはファイルに保存しない。メモリ上でも平文ではなく、ソルト付きのハッシュで持つ

## セッション

- ログインに成功したら、新しいセッションIDを発行する（セッション固定攻撃への対策）
- Cookieには`HttpOnly`と`SameSite=Strict`（無理なら`Lax`）を付ける
- `Secure`属性を付けたCookieはHTTPSでしか送られない。HTTPで動かすMVP（Minimum Viable Product、最初に公開する版）では付けず、HTTPSへの対応と同時に付ける
- セッションの有効期限はサーバー側で管理する。利用中かどうかに関係なく切れる絶対的な期限（`--expires`）を持つ
- 次のときは、サーバー側のセッションを破棄し、Cookieも期限切れにする
  - ログアウトしたとき
  - 有効期限が切れたとき
  - サーバーを終了したとき

## ログインの失敗

- 試行の回数を制限し、失敗が続いたら待ち時間を延ばす。回数と待ち時間の値はissue #8で決める
- 失敗時のメッセージとHTTPステータスは、失敗の理由に関係なく同じものを返す
- 入力の長さに上限を設ける。値はissue #8で決める

## APIと待ち受けの制限

- メディアの配信を含め、すべてのAPIで認証を確認する
- APIのパラメータからローカルのパスを指定させない。ファイルはIDで指定させ、サーバー側でパスに変換する
- LAN内のインターフェースだけで待ち受ける
- テレメトリや外部への送信を入れない

## 出典

- [OWASP Session Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)
- [OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)
- [secrets – Generate secure random numbers for managing secrets](https://docs.python.org/3/library/secrets.html)
- [MDN：Set-Cookie](https://developer.mozilla.org/ja/docs/Web/HTTP/Reference/Headers/Set-Cookie)
