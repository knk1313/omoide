"""スマホから操作するためのローカルサーバー。ビルド済みの UI と API を配信する。"""

from pathlib import Path

from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.types import Scope

from .auth import MAX_PASSWORD_LENGTH, LoginLocked, ShareAuth
from .jobs import InsufficientSpace, JobManager, JobsBusy, NothingSelected
from .workspace import PanelEntry, Workspace

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


class SettingsRequest(BaseModel):
    speed: float


def create_app(
    workspace: Workspace, auth: ShareAuth, web_dir: Path = WEB_DIST, jobs: JobManager | None = None,
) -> FastAPI:
    jobs = jobs or JobManager(workspace)
    # API の仕様書の画面は使わないので公開しない
    app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)

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
    def select_all(body: SelectionRequest) -> dict:
        workspace.select_all(body.selected)
        return workspace.summary()

    @app.patch("/api/settings")
    def update_settings(body: SettingsRequest) -> dict:
        try:
            workspace.set_speed(body.speed)
        except ValueError as e:
            raise HTTPException(status_code=422, detail=str(e)) from e
        return workspace.summary()

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
    def download() -> FileResponse:
        job = jobs.latest_done("export")
        if job is None:
            raise HTTPException(status_code=404, detail="完成版がまだありません")
        # スマホで再生画面ではなく保存に進むよう、添付ファイルとして返す
        return FileResponse(job.path, media_type="video/mp4", filename=job.path.name)

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
