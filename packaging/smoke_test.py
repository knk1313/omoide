"""作った単体アプリが動くかを確かめる。CI（.github/workflows/release.yml）と手元で使う。

確かめること:
1. アプリに含めた ffmpeg が動き、完成版の作成に使う libx264 が入っている
2. 別のフォルダから起動しても、アプリのフォルダの input/ を見る
3. serve を起動し、パスワードを入れると、共有の URL で画面が開き、ログインして API が使える（macOS・Linux だけ。
   パスワードの入力に疑似端末を使うため）

使い方: python packaging/smoke_test.py packaging/dist/omoide
"""

import http.cookiejar
import json
import os
import re
import select
import subprocess
import sys
import tempfile
import threading
import time
import urllib.request
from pathlib import Path

PASSWORD = "smoke-test"


def check(condition: bool, message: str) -> None:
    if not condition:
        sys.exit(f"失敗: {message}")
    print(f"OK: {message}")


def check_ffmpeg(app: Path) -> None:
    name = "ffmpeg.exe" if sys.platform == "win32" else "ffmpeg"
    ffmpeg = app / "_internal" / "ffmpeg" / name
    check(ffmpeg.is_file(), f"ffmpeg が含まれている（{ffmpeg}）")
    encoders = subprocess.run([str(ffmpeg), "-hide_banner", "-encoders"], capture_output=True, text=True, check=True).stdout
    check("libx264" in encoders, "ffmpeg に libx264 が入っている")


def check_scan(app: Path, executable: Path) -> None:
    with tempfile.TemporaryDirectory() as elsewhere:
        result = subprocess.run([str(executable), "scan"], cwd=elsewhere, capture_output=True, text=True, encoding="utf-8")
    check(result.returncode == 1 and "input" in result.stdout + result.stderr, "別のフォルダから起動しても、アプリの input/ を見る")


def check_serve(executable: Path) -> None:
    import pty

    port = 18765
    pid, fd = pty.fork()
    if pid == 0:
        os.execv(str(executable), [str(executable), "serve", "--host", "127.0.0.1", "--port", str(port), "--expires", "2m"])
    output = b""
    try:
        def read_until(pattern: bytes, timeout: float = 60) -> bytes:
            nonlocal output
            end = time.time() + timeout
            while time.time() < end:
                # 出力が来るまで最長 1 秒だけ待つ（来ないまま止まらないように）
                ready, _, _ = select.select([fd], [], [], 1)
                if not ready:
                    continue
                try:
                    chunk = os.read(fd, 4096)
                except OSError:
                    break
                output += chunk
                if re.search(pattern, output):
                    return output
            sys.exit(f"失敗: 出力に {pattern!r} が出なかった\n{output.decode(errors='replace')}")

        read_until("パスワード".encode())
        os.write(fd, f"{PASSWORD}\n".encode())
        read_until("もう一度".encode())
        os.write(fd, f"{PASSWORD}\n".encode())
        text = read_until(rb"http://127\.0\.0\.1:\d+/p/[A-Za-z0-9_-]+").decode(errors="replace")
        url = re.search(r"http://127\.0\.0\.1:\d+/p/[A-Za-z0-9_-]+", text).group(0)
        check(True, "serve が起動し、共有の URL を表示した")
        # このあとも QR コードなどの出力が続く。読まずにおくと、端末の受け口が埋まってアプリが止まるので、読み捨て続ける
        def drain() -> None:
            while True:
                try:
                    if not os.read(fd, 4096):
                        return
                except OSError:
                    return

        threading.Thread(target=drain, daemon=True).start()

        jar = http.cookiejar.CookieJar()
        opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
        base = f"http://127.0.0.1:{port}"
        html = ""
        for _ in range(30):
            try:
                html = opener.open(url, timeout=5).read().decode()
                break
            except OSError:
                time.sleep(1)
        check('id="root"' in html, "共有の URL で画面（web/dist）が開く")
        request = urllib.request.Request(
            f"{base}/api/session/login", data=json.dumps({"password": PASSWORD}).encode(),
            headers={"Content-Type": "application/json"}, method="POST",
        )
        check(opener.open(request, timeout=5).status == 200, "パスワードでログインできる")
        project = json.loads(opener.open(f"{base}/api/project", timeout=5).read())
        check(project["total_count"] == 0, "API が使える（動画は 0 本）")
    finally:
        os.kill(pid, 2)
        # Ctrl+C で止まらなければ、強制的に止める
        for _ in range(20):
            if os.waitpid(pid, os.WNOHANG) != (0, 0):
                break
            time.sleep(0.5)
        else:
            os.kill(pid, 9)
            os.waitpid(pid, 0)


def main() -> None:
    app = Path(sys.argv[1]).resolve()
    executable = app / ("omoide.exe" if sys.platform == "win32" else "omoide")
    check(executable.is_file(), f"実行ファイルがある（{executable}）")
    check_ffmpeg(app)
    check_scan(app, executable)
    if sys.platform == "win32":
        print("Windows では serve の確認を省く（パスワードの入力に疑似端末を使うため）")
    else:
        check_serve(executable)
    print("すべて確かめた")


if __name__ == "__main__":
    main()
