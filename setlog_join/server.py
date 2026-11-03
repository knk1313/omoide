"""スマホから操作するためのローカルサーバー。ビルド済みの UI と API を配信する。"""

from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.types import Scope

from .scan import VideoScan

WEB_DIST = Path(__file__).resolve().parent.parent / "web" / "dist"

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


def create_app(scans: list[VideoScan], web_dir: Path = WEB_DIST) -> FastAPI:
    # API の仕様書の画面は使わないので公開しない
    app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)

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
