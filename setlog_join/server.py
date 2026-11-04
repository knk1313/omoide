"""スマホから操作するためのローカルサーバー。ビルド済みの UI と API を配信する。"""

import sys
import traceback
from pathlib import Path
from urllib.parse import unquote

from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.requests import ClientDisconnect
from starlette.types import Scope

from . import storage as storage_settings
from .auth import MAX_PASSWORD_LENGTH, LoginLocked, ShareAuth
from .jobs import Analyzer, InsufficientSpace, JobManager, JobsBusy, NothingSelected, analyze_video
from .storage import Storage, StorageError
from .uploads import UploadError, save_upload, upload_path
from .workspace import DateConflict, PanelEntry, Workspace

WEB_DIST = Path(__file__).resolve().parent.parent / "web" / "dist"

# 共有 URL のトークンを開いた端末にだけ付ける Cookie と、ログイン後のセッションの Cookie
GATE_COOKIE = "omoide_gate"
SESSION_COOKIE = "omoide_session"
_LOGIN_PATH = "/api/session/login"

_NOT_BUILT_HTML = """<!doctype html>
<html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>omoide</title>
<p>画面がまだビルドされていません。Mac で <code>cd web &amp;&amp; npm run build</code> を実行してから、もう一度起動してください。</p>
</html>"""


class _SinglePageFiles(StaticFiles):
    """ファイルが無いパスには index.html を返し、画面側のルーティングに任せる。"""

    async def get_response(self, path: str, scope: Scope):
        try:
            return await super().get_response(path, scope)
        # StaticFiles が送出するのは Starlette の HTTPException (FastAPI のものはその子クラス)
        except StarletteHTTPException as e:
            if e.status_code != 404:
                raise
            return await super().get_response("index.html", scope)


class LoginRequest(BaseModel):
    password: str = Field(max_length=MAX_PASSWORD_LENGTH)


class SelectionRequest(BaseModel):
    selected: bool


class BulkSelectionRequest(BaseModel):
    selected: bool
    # 上から 1・2・3。省略すると全員
    panel: int | None = Field(default=None, ge=1, le=3)
    # True なら、対象のユーザーを採用し、それ以外を除外する
    only: bool = False


class StorageRequest(BaseModel):
    # 保存先のフォルダ（フルパス。~ で始めてもよい）
    input: str = Field(max_length=4096)
    output: str = Field(max_length=4096)
    work: str = Field(max_length=4096)


class VideoDateRequest(BaseModel):
    # `2026-09-19` の形。null なら入力を消し、メタデータの日付に戻す
    date: str | None


class SettingsRequest(BaseModel):
    speed: float


def create_app(
    workspace: Workspace, auth: ShareAuth, web_dir: Path = WEB_DIST, jobs: JobManager | None = None,
    upload_dir: Path = Path("input"), analyze: Analyzer = analyze_video, storage: Storage | None = None,
) -> FastAPI:
    # 今使っている保存先。渡されなければ、動画は upload_dir、ほかは今のフォルダの既定の場所とみなす
    store = storage or Storage(input=upload_dir, output=Path("output"), work=Path(".setlog-join"))
    jobs = jobs or JobManager(workspace)
    # API の仕様書の画面は使わないので公開しない
    app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)

    @app.exception_handler(RequestValidationError)
    async def invalid_request(request: Request, exc: RequestValidationError) -> JSONResponse:
        # 検証の詳細の一覧ではなく、利用者が次に取る操作を返す
        return JSONResponse(
            {"detail": "送られた内容が正しくありません。画面を再読み込みしてから、もう一度お試しください"},
            status_code=422,
        )

    @app.exception_handler(Exception)
    async def unexpected(request: Request, exc: Exception) -> JSONResponse:
        # 原因は Mac のターミナルに残し、画面には次に取る操作だけを返す
        traceback.print_exception(exc, file=sys.stderr)
        return JSONResponse(
            {"detail": "Mac側で問題が起きました。もう一度お試しください。続くときは、Macのターミナルの表示を確かめてください"},
            status_code=500,
        )

    @app.middleware("http")
    async def guard(request: Request, call_next):
        if auth.expired:
            return JSONResponse({"detail": "共有の期限が切れました"}, status_code=410)
        path = request.url.path
        if path.startswith("/p/"):
            return await call_next(request)
        # 共有 URL を開いていない端末には、サーバーがあることも見せない
        if not auth.token_matches(request.cookies.get(GATE_COOKIE)):
            return JSONResponse({"detail": "Not Found"}, status_code=404)
        # 動画・サムネイル (/media/) と完成版 (/download/) も、ログインしていなければ渡さない
        if path.startswith(("/api/", "/media/", "/download/")) and path != _LOGIN_PATH:
            if not auth.session_valid(request.cookies.get(SESSION_COOKIE)):
                return JSONResponse({"detail": "ログインしてください"}, status_code=401)
        return await call_next(request)

    @app.get("/p/{token}")
    def open_share(token: str) -> Response:
        if not auth.token_matches(token):
            return JSONResponse({"detail": "Not Found"}, status_code=404)
        response = RedirectResponse("/", status_code=303)
        _set_cookie(response, GATE_COOKIE, auth.token, auth)
        return response

    @app.post(_LOGIN_PATH)
    def login(body: LoginRequest) -> Response:
        try:
            session = auth.login(body.password)
        except LoginLocked as e:
            return JSONResponse(
                {"detail": "ログインの試行が続いたため、しばらく待ってください"},
                status_code=429, headers={"Retry-After": str(int(e.retry_after) + 1)},
            )
        except ValueError:
            # 失敗の理由は区別せず、同じ応答を返す
            return JSONResponse({"detail": "パスワードが違います"}, status_code=401)
        response = JSONResponse({"status": "ok"})
        _set_cookie(response, SESSION_COOKIE, session, auth)
        return response

    @app.post("/api/session/logout")
    def logout(request: Request) -> Response:
        auth.logout(request.cookies.get(SESSION_COOKIE))
        response = JSONResponse({"status": "ok"})
        response.delete_cookie(SESSION_COOKIE, path="/", httponly=True, samesite="strict")
        return response

    @app.get("/api/health")
    def health() -> dict:
        return {"status": "ok"}

    @app.get("/api/project")
    def project() -> dict:
        return workspace.summary()

    @app.get("/api/clips")
    def clips() -> list[dict]:
        return [_clip_json(workspace, entry) for entry in workspace.entries.values()]

    @app.patch("/api/clips/{panel_id:path}")
    def update_clip(panel_id: str, body: SelectionRequest) -> dict:
        entry = _find(workspace, panel_id)
        workspace.set_selected(entry.id, body.selected)
        return _clip_json(workspace, entry)

    @app.post("/api/clips/select-all")
    def select_all(body: BulkSelectionRequest) -> dict:
        workspace.select_all(body.selected, panel=body.panel, only=body.only)
        return workspace.summary()

    @app.patch("/api/settings")
    def update_settings(body: SettingsRequest) -> dict:
        try:
            workspace.set_speed(body.speed)
        except ValueError as e:
            raise HTTPException(status_code=422, detail=str(e)) from e
        return workspace.summary()

    @app.post("/api/videos", status_code=202)
    async def upload_video(request: Request) -> dict:
        # 元のファイル名は、日本語などを含められるよう URL エンコードして X-File-Name で受け取る
        raw_name = unquote(request.headers.get("x-file-name", ""))
        length = request.headers.get("content-length")
        try:
            destination = upload_path(raw_name, upload_dir)
            await save_upload(request.stream(), int(length) if length and length.isdigit() else None, destination)
        except UploadError as e:
            raise HTTPException(status_code=e.status, detail=str(e)) from e
        except ClientDisconnect:
            raise HTTPException(status_code=400, detail="送っている途中で接続が切れました。もう一度お試しください") from None
        return jobs.start_analysis(destination, analyze).to_json()

    @app.delete("/api/videos/{name}")
    def delete_video(name: str) -> dict:
        # 作っている途中の動画が、消した動画のパネルを読みに行かないようにする
        if jobs.generating():
            raise HTTPException(status_code=409, detail="プレビューか完成版を作っている間は消せません。作り終えてから、もう一度お試しください")
        try:
            workspace.remove_video(name)
        except KeyError:
            raise HTTPException(status_code=404, detail="動画がありません") from None
        return workspace.summary()

    @app.patch("/api/videos/{name}")
    def update_video(name: str, body: VideoDateRequest) -> dict:
        try:
            workspace.set_video_date(name, body.date)
            return workspace.video_json(workspace.find_video(name))
        except KeyError:
            raise HTTPException(status_code=404, detail="動画がありません") from None
        except DateConflict as e:
            raise HTTPException(status_code=409, detail=str(e)) from e
        except ValueError as e:
            raise HTTPException(status_code=422, detail=str(e)) from e

    @app.post("/api/preview", status_code=202)
    def start_preview() -> dict:
        return _start(jobs, "preview")

    @app.post("/api/export", status_code=202)
    def start_export() -> dict:
        return _start(jobs, "export")

    @app.get("/api/jobs/{job_id}")
    def job_status(job_id: str) -> dict:
        try:
            return jobs.get(job_id).to_json()
        except KeyError:
            raise HTTPException(status_code=404, detail="ジョブがありません") from None

    def storage_status() -> dict:
        upcoming = storage_settings.pending()
        return {
            "editable": storage_settings.editable(),
            "current": store.to_json(),
            "pending": upcoming.to_json() if upcoming else None,
            "presets": storage_settings.presets() if storage_settings.editable() else [],
            "usage": {key: storage_settings.usage(path) for key, path in store.folders().items()},
        }

    @app.get("/api/storage")
    def get_storage() -> dict:
        return storage_status()

    @app.put("/api/storage")
    def set_storage(body: StorageRequest) -> dict:
        # 使っている最中のファイルは動かさず、次に起動したときに移す
        if not storage_settings.editable():
            raise HTTPException(status_code=409, detail="開発環境では、保存先を変えられません。起動したフォルダの input・output・.setlog-join を使います")
        try:
            target = storage_settings.validate(body.model_dump(), store)
            storage_settings.save_pending(target)
        except StorageError as e:
            raise HTTPException(status_code=422, detail=str(e)) from e
        return storage_status()

    @app.delete("/api/storage/pending")
    def cancel_storage_change() -> dict:
        storage_settings.cancel_pending()
        return storage_status()

    @app.delete("/api/data")
    def clear_data() -> dict:
        # 取り込んだ動画・完成版・作業用ファイルをすべて消し、動画のない状態に戻す（main.py clean と同じ対象）
        try:
            jobs.clear_data(storage_settings.contents(store))
        except JobsBusy as e:
            raise HTTPException(status_code=409, detail=str(e)) from e
        return workspace.summary()

    @app.delete("/api/temporary")
    def clear_temporary() -> dict:
        try:
            jobs.clear_temporary()
        except JobsBusy as e:
            raise HTTPException(status_code=409, detail=str(e)) from e
        return {"status": "ok"}

    @app.get("/media/preview")
    def preview() -> FileResponse:
        job = jobs.latest_done("preview")
        if job is None:
            raise HTTPException(status_code=404, detail="プレビューがまだありません")
        return FileResponse(job.path, media_type="video/mp4")

    @app.get("/download/output")
    def download(name: str | None = None) -> FileResponse:
        job = jobs.latest_done("export")
        if job is None:
            raise HTTPException(status_code=404, detail="完成版がまだありません")
        # スマホで再生画面ではなく保存に進むよう、添付ファイルとして返す。名前は利用者が決めたものにする
        return FileResponse(job.path, media_type="video/mp4", filename=download_name(name, job.path.stem))

    @app.get("/media/thumbnails/{panel_id:path}")
    def thumbnail(panel_id: str) -> FileResponse:
        path = workspace.thumbnail_path(_find(workspace, panel_id))
        if not path.is_file():
            raise HTTPException(status_code=404, detail="サムネイルがありません")
        return FileResponse(path, media_type="image/jpeg")

    @app.get("/media/clips/{panel_id:path}")
    def clip_video(panel_id: str) -> FileResponse:
        # FileResponse は Range リクエストに 206 で応え、Safari のシークに対応する
        return FileResponse(workspace.clip_path(_find(workspace, panel_id)), media_type="video/mp4")

    # 存在しない API に index.html を返さないよう、画面の配信より先に 404 を返す
    @app.api_route("/api/{path:path}", methods=["GET", "POST", "PATCH", "PUT", "DELETE"])
    def api_not_found(path: str) -> None:
        raise HTTPException(status_code=404, detail="Not Found")

    if (web_dir / "index.html").is_file():
        app.mount("/", _SinglePageFiles(directory=web_dir, html=True), name="web")
    else:
        @app.get("/{path:path}", response_class=HTMLResponse)
        def not_built(path: str) -> str:
            return _NOT_BUILT_HTML

    return app


_MAX_NAME_LENGTH = 80


def download_name(name: str | None, fallback: str) -> str:
    """保存するファイル名。パスの区切りや制御文字を除き、長さを抑えて .mp4 を付ける。"""
    cleaned = "".join(c for c in (name or "") if c.isprintable() and c not in '/\\:*?"<>|').strip().strip(".")
    if cleaned.lower().endswith(".mp4"):
        cleaned = cleaned[:-4].rstrip()
    return f"{(cleaned or fallback)[:_MAX_NAME_LENGTH]}.mp4"


def _start(jobs: JobManager, kind: str) -> dict:
    try:
        return jobs.start(kind).to_json()
    except NothingSelected as e:
        raise HTTPException(status_code=422, detail=str(e)) from e
    except InsufficientSpace as e:
        raise HTTPException(status_code=507, detail=str(e)) from e


def _find(workspace: Workspace, panel_id: str) -> PanelEntry:
    try:
        return workspace.get(panel_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="パネルがありません") from None


def _clip_json(workspace: Workspace, entry: PanelEntry) -> dict:
    clip = entry.clip
    return {
        "id": entry.id,
        "video": entry.ref.video,
        "clip": entry.ref.clip,
        "panel": entry.ref.panel,
        "label": entry.panel.label,
        # 画面で再生枠とサムネイルをパネルと同じ縦横比にし、上下や左右に黒い帯を出さないため
        "width": entry.panel.width,
        "height": entry.panel.height,
        "start": round(clip.start, 3),
        "duration": round(clip.duration, 3),
        "selected": workspace.is_selected(entry),
        "thumbnail_url": f"/media/thumbnails/{entry.id}",
        "video_url": f"/media/clips/{entry.id}",
    }


def _set_cookie(response: Response, name: str, value: str, auth: ShareAuth) -> None:
    # HTTP で動かすため Secure は付けられない。HTTPS に対応するときに付ける
    response.set_cookie(
        name, value, max_age=int(auth.remaining_seconds) + 1, path="/", httponly=True, samesite="strict",
    )
