# サーバーのAPI

`serve`が提供するAPIの一覧。画面（`web/`）はこのAPIだけを使って動く。

## 認証

認証の流れは[security.md](security.md)に書いてある。要点は次のとおり。

- 共有URL（`/p/<トークン>`）を開いていない端末には、どのパスにも404を返す
- `/api/session/login`以外の`/api/`と、`/media/`は、ログインしていないと401を返す
- 共有の期限が切れたら、すべてに410を返す

## パネルのID

パネルは`<動画名>/<クリップ番号>-<パネル番号>`のIDで指定する（例：`20260919/003-2`）。パネル番号は上から1、2、3。`scan --export`のファイル名、`join --select`の指定と同じ形である。

サーバーはIDを解析結果の一覧で引き、ファイルのパスはサーバー側で組み立てる。存在しないIDには404を返す。

## 一覧

| メソッドとパス | 内容 | 本文 |
| --- | --- | --- |
| `POST /api/session/login` | ログインする | `{"password": "..."}` |
| `POST /api/session/logout` | ログアウトする | なし |
| `GET /api/project` | 速度、パネルの総数と採用数、推定時間（秒）、動画の一覧 | なし |
| `GET /api/clips` | 中身のあるパネルの一覧（動画、クリップ、パネルの順） | なし |
| `PATCH /api/clips/<ID>` | パネルを採用・除外する | `{"selected": true}` |
| `POST /api/clips/select-all` | すべてを採用・除外する | `{"selected": false}` |
| `PATCH /api/settings` | 速度を変える（0.5、1、1.5、2） | `{"speed": 1.5}` |
| `GET /media/thumbnails/<ID>` | サムネイル（JPEG、幅400px） | なし |
| `GET /media/clips/<ID>` | パネル単体の動画（MP4） | なし |

採用・除外と速度を変えると、その都度`.setlog-join/projects/project.json`へ保存する。

## `GET /api/clips`の要素

```json
{
  "id": "20260919/001-2",
  "video": "20260919",
  "clip": 1,
  "panel": 2,
  "label": "中",
  "start": 0.0,
  "duration": 2.0,
  "selected": true,
  "thumbnail_url": "/media/thumbnails/20260919/001-2",
  "video_url": "/media/clips/20260919/001-2"
}
```

`start`と`duration`は、パネルの先頭と末尾の黒いフレームを除いた区間（秒）である。

## 動画の配信

- パネル単体の動画は、最初の要求で作って`.setlog-join/clips/`へ保存し、以降は使い回す。最初の1回は作るのを待つ
- Rangeリクエストに対応する。範囲を指定すると206、範囲外なら416を返す
- 動画の目次（moov）を先頭に置いているので、全体を読み込む前に再生を始められる
