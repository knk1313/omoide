"""スマホから操作するためのローカルサーバー。ビルド済みの UI と API を配信する。"""

from pathlib import Path

from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.types import Scope

from .auth import MAX_PASSWORD_LENGTH, LoginLocked, ShareAuth
from .scan import VideoScan

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


def create_app(scans: list[VideoScan], auth: ShareAuth, web_dir: Path = WEB_DIST) -> FastAPI:
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
        if path.startswith("/api/") and path != _LOGIN_PATH:
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
        return {
            "status": "ok",
            "videos": len(scans),
            "clips": sum(len(s.clips) for s in scans),
            "panels": sum(s.candidate_count for s in scans),
        }

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


def _set_cookie(response: Response, name: str, value: str, auth: ShareAuth) -> None:
    # HTTP で動かすため Secure は付けられない。HTTPS に対応するときに付ける
    response.set_cookie(
        name, value, max_age=int(auth.remaining_seconds) + 1, path="/", httponly=True, samesite="strict",
    )
