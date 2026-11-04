"""スマホ向けの共有（serve）を始める・止める。ターミナルの serve と、Mac のブラウザーの「始める」画面（launcher.py）の両方から使う。"""

import sys
import threading
from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime, timedelta
from functools import partial
from pathlib import Path

from .auth import MAX_PASSWORD_LENGTH, ShareAuth
from .cache import load_or_scan
from .inputs import find_videos
from .network import port_available, resolve_host
from .storage import Storage
from .thumbnails import ensure_thumbnails

MIN_PASSWORD_LENGTH = 4

Report = Callable[[str], None]


class ShareError(ValueError):
    """共有を始められない。メッセージは利用者向け（次に取る操作を書く）。"""


def check_password(password: str) -> None:
    if len(password) < MIN_PASSWORD_LENGTH:
        raise ShareError(f"パスワードは{MIN_PASSWORD_LENGTH}文字以上にしてください")
    if len(password) > MAX_PASSWORD_LENGTH:
        raise ShareError(f"パスワードは{MAX_PASSWORD_LENGTH}文字以内にしてください")


@dataclass
class Share:
    """始めた共有。server.run() を呼ぶと、止めるか期限が来るまで動く。"""

    server: object  # uvicorn.Server
    auth: ShareAuth
    url: str
    ends_at: datetime
    videos: int
    panels: int
    _expiry: threading.Timer

    def run(self) -> None:
        self._expiry.start()
        try:
            self.server.run()
        finally:
            self._expiry.cancel()
            self.auth.end()

    def stop(self) -> None:
        self.server.should_exit = True


def prepare(
    password: str, lifetime: float, store: Storage, folder: Path, host: str | None = None, port: int = 8080,
    report: Report = print,
) -> Share:
    """共有の準備をする（動画を読み込み、サーバーを用意する）。始めるには返り値の run() を呼ぶ。"""
    # サーバーの依存は scan / join では使わないので、ここで読み込む
    import uvicorn

    from .jobs import JobManager, analyze_video
    from .server import create_app
    from .workspace import Workspace

    check_password(password)
    try:
        host = resolve_host(host)
    except ValueError as e:
        raise ShareError(str(e)) from e
    if not port_available(host, port):
        raise ShareError(f"ポート{port}は使用中です。ほかでomoideが動いていないか確かめてください")

    # スマホから動画を取り込めるので、入力フォルダが空でも始める
    folder.mkdir(parents=True, exist_ok=True)
    scans = []
    for info in find_videos(folder):
        try:
            scan = load_or_scan(info, store.cache)
        except ValueError as e:
            # 1 本読めなくても、ほかの動画で使えるようにする
            print(f"{info.path.name} は読み飛ばします: {e}", file=sys.stderr)
            continue
        ensure_thumbnails(scan, store.thumbnails)
        scans.append(scan)
    panels = sum(s.candidate_count for s in scans)
    if not scans:
        report("動画はまだありません。スマホの画面からアップロードできます。")
    report(f"動画 {len(scans)} 本 / 中身のあるパネル {panels} 件を読み込みました。")

    auth = ShareAuth(password, lifetime)
    # スマホから取り込んだ動画も、入力フォルダに置く（次に起動したときも読み込まれる）
    workspace = Workspace(scans, store.project, store.thumbnails, store.clips)
    jobs = JobManager(workspace, store.previews, store.output)
    app = create_app(
        workspace, auth, jobs=jobs, upload_dir=folder, analyze=partial(analyze_video, cache_dir=store.cache), storage=store,
    )
    server = uvicorn.Server(uvicorn.Config(app, host=host, port=port, log_level="warning"))
    expiry = threading.Timer(lifetime, lambda: setattr(server, "should_exit", True))
    expiry.daemon = True
    return Share(
        server=server,
        auth=auth,
        url=f"http://{host}:{port}/p/{auth.token}",
        ends_at=datetime.now() + timedelta(seconds=lifetime),
        videos=len(scans),
        panels=panels,
        _expiry=expiry,
    )
