"""Mac のブラウザーで共有を始める画面（「始める」画面）のサーバー。

単体アプリを引数なしで起動すると、127.0.0.1 の空いているポートでこのサーバーを立ち上げ、既定のブラウザーで開く。
画面でパスワードと期限を決めると、スマホ向けの共有（share.py、今の serve と同じ）を始める。

Mac の外からは開けない（127.0.0.1 だけで待ち受ける）。同じ Mac のほかのサイトから操作されないよう、
起動のたびに決める合言葉（トークン）を Cookie で確かめ、Host ヘッダーが 127.0.0.1 か localhost であることも確かめる
（DNS リバインディング対策）。スマホ側の安全の仕組み（パスワード・共有の URL・期限）は変えない。
"""

import io
import secrets
import socket
import threading
import time
import webbrowser
from collections.abc import Callable
from datetime import datetime
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse, RedirectResponse, Response
from pydantic import BaseModel, Field

from .auth import MAX_PASSWORD_LENGTH
from .server import WEB_DIST, _SinglePageFiles
from .share import Share, ShareError, prepare
from .storage import Storage

COOKIE = "omoide_launcher"
# 画面で選べる共有の期限（秒）
EXPIRES = {"1h": 3600, "2h": 7200, "4h": 14400}


class StartRequest(BaseModel):
    password: str = Field(max_length=MAX_PASSWORD_LENGTH)
    expires: str = Field(pattern="^(1h|2h|4h)$")


class Controller:
    """共有を 1 つだけ持ち、始める・止める・様子を返す。"""

    def __init__(
        self, store: Storage, prepare_share: Callable[..., Share] = prepare, tools_available: Callable[[], bool] = lambda: True,
    ):
        self._store = store
        self._prepare = prepare_share
        self._tools_available = tools_available
        self._share: Share | None = None
        self._thread: threading.Thread | None = None
        self._lock = threading.Lock()
        # 共有が止まったときの理由（期限が来た、など）。次に始めるまで画面に出す
        self._notice: str | None = None
        self._stopping = False

    def running(self) -> bool:
        return self._thread is not None and self._thread.is_alive()

    def status(self) -> dict:
        with self._lock:
            share = self._share if self.running() else None
            if share is None and self._share is not None:
                # 動いていたのに止まった（期限が来た）
                if not self._stopping:
                    self._notice = "期限が来たので、共有を終えました。もう一度始めるには、パスワードを決め直してください"
                self._share, self._thread, self._stopping = None, None, False
            return {
                "state": "running" if share else "idle",
                "url": share.url if share else None,
                "ends_at": share.ends_at.astimezone().isoformat() if share else None,
                "videos": share.videos if share else None,
                "notice": self._notice,
                "storage": self._store.to_json(),
            }

    def start(self, password: str, lifetime: float) -> dict:
        with self._lock:
            if self.running():
                raise ShareError("すでに共有しています。始め直すときは、先に「共有を止める」を押してください")
            if not self._tools_available():
                raise ShareError("動画を扱う道具（ffmpeg）が見つかりません。ダウンロードした zip を展開し直してください")
            share = self._prepare(password, lifetime, self._store, self._store.input)
            thread = threading.Thread(target=share.run, name="omoide-share", daemon=True)
            thread.start()
            self._share, self._thread, self._notice, self._stopping = share, thread, None, False
        return self.status()

    def stop(self) -> dict:
        with self._lock:
            share, thread = self._share, self._thread
            if share is not None:
                self._stopping = True
                share.stop()
        if thread is not None:
            thread.join(timeout=10)
        with self._lock:
            self._share, self._thread, self._stopping = None, None, False
            self._notice = "共有を止めました。スマホの画面は使えなくなりました"
        return self.status()

    def qr_svg(self) -> bytes | None:
        share = self._share if self.running() else None
        if share is None:
            return None
        import qrcode
        import qrcode.image.svg

        image = qrcode.make(share.url, image_factory=qrcode.image.svg.SvgPathImage, border=2)
        buffer = io.BytesIO()
        image.save(buffer)
        return buffer.getvalue()


def create_launcher_app(controller: Controller, token: str, port: int, web_dir: Path = WEB_DIST, on_quit: Callable[[], None] = lambda: None) -> FastAPI:
    app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
    allowed_hosts = {f"127.0.0.1:{port}", f"localhost:{port}"}

    @app.middleware("http")
    async def guard(request: Request, call_next):
        # 127.0.0.1 以外の名前で届いた要求（DNS リバインディング）は受けない
        if request.headers.get("host") not in allowed_hosts:
            return JSONResponse({"detail": "この画面は、omoideを起動したMacからだけ開けます"}, status_code=403)
        if request.url.path.startswith("/launcher/api/") and not secrets.compare_digest(request.cookies.get(COOKIE, ""), token):
            return JSONResponse({"detail": "omoideを起動し直して、開いた画面から操作してください"}, status_code=403)
        return await call_next(request)

    @app.get("/launcher/t/{given}")
    def enter(given: str) -> Response:
        # 起動したときに開くURL。合言葉が合えば Cookie を付けて、画面へ移す
        if not secrets.compare_digest(given, token):
            raise HTTPException(status_code=404)
        response = RedirectResponse("/launcher", status_code=303)
        response.set_cookie(COOKIE, token, httponly=True, samesite="strict", path="/")
        return response

    @app.get("/launcher/api/status")
    def status() -> dict:
        return controller.status()

    @app.post("/launcher/api/start")
    def start(body: StartRequest) -> dict:
        try:
            return controller.start(body.password, EXPIRES[body.expires])
        except ShareError as e:
            raise HTTPException(status_code=409, detail=str(e)) from e

    @app.post("/launcher/api/stop")
    def stop() -> dict:
        return controller.stop()

    @app.get("/launcher/api/qr.svg")
    def qr() -> Response:
        svg = controller.qr_svg()
        if svg is None:
            raise HTTPException(status_code=404, detail="共有していません")
        return Response(svg, media_type="image/svg+xml", headers={"Cache-Control": "no-store"})

    @app.post("/launcher/api/quit")
    def quit_app() -> dict:
        controller.stop()
        # 応答を返してから止める
        threading.Timer(0.5, on_quit).start()
        return {"status": "ok"}

    if (web_dir / "index.html").is_file():
        app.mount("/", _SinglePageFiles(directory=web_dir, html=True), name="web")
    return app


def free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def launch(store: Storage, tools_available: Callable[[], bool], open_browser: bool = True) -> int:
    """「始める」画面を立ち上げ、ブラウザーで開く。画面の「omoideを終了する」か Ctrl+C で終わる。"""
    import uvicorn

    port = free_port()
    token = secrets.token_urlsafe(24)
    controller = Controller(store, tools_available=tools_available)
    server: uvicorn.Server | None = None

    def quit_server() -> None:
        if server is not None:
            server.should_exit = True

    app = create_launcher_app(controller, token, port, on_quit=quit_server)
    server = uvicorn.Server(uvicorn.Config(app, host="127.0.0.1", port=port, log_level="warning"))
    url = f"http://127.0.0.1:{port}/launcher/t/{token}"

    def announce() -> None:
        # 待ち受けを始めてから URL を出し、ブラウザーで開く（先に開くと、つながらないことがある）
        while not server.started:
            if server.should_exit:
                return
            time.sleep(0.05)
        print("omoide の画面をブラウザーで開いています。開かないときは、次の URL をブラウザーで開いてください。")
        print(url)
        print("終わるときは、画面の「omoideを終了する」を押すか、この窓で Ctrl+C を押してください。", flush=True)
        if open_browser:
            webbrowser.open(url)

    threading.Thread(target=announce, name="omoide-announce", daemon=True).start()
    try:
        server.run()
    except KeyboardInterrupt:
        pass
    finally:
        controller.stop()
    print(f"omoide を終了しました（{datetime.now():%H:%M}）。")
    return 0
