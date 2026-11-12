"""単体アプリに含める ffmpeg・ffprobe を取得し、配布元のハッシュ値で確かめて build/ffmpeg/ に置く。

omoide は完成版の作成に libx264 を使うため、GPL 版のビルドを使う（LGPL 版には libx264 が入っていない）。
ffmpeg は別のプログラムとして呼び出すだけで、omoide 本体には組み込まない。
取得したビルドの版と入手先は build/ffmpeg/SOURCE.txt に書き、配布物の THIRD_PARTY_NOTICES.txt に載せる。

使い方: python packaging/fetch_ffmpeg.py
手元で試すときは --local を付けると、取得せずに PATH の ffmpeg・ffprobe をコピーする（配布には使わない）。
"""

import hashlib
import io
import json
import platform
import shutil
import stat
import sys
import tarfile
import urllib.request
import zipfile
from pathlib import Path

OUT = Path(__file__).resolve().parent / "build" / "ffmpeg"

# Windows・Linux: BtbN/FFmpeg-Builds の 9.0 系の GPL 版（静的リンク）。毎日作り直されるので、同じ 9.0 系の最新を使う
BTBN_RELEASE = "https://api.github.com/repos/BtbN/FFmpeg-Builds/releases/tags/latest"
BTBN_ASSETS = {
    ("Windows", "AMD64"): "ffmpeg-n9.0-latest-win64-gpl-9.0.zip",
    ("Linux", "x86_64"): "ffmpeg-n9.0-latest-linux64-gpl-9.0.tar.xz",
    ("Linux", "aarch64"): "ffmpeg-n9.0-latest-linuxarm64-gpl-9.0.tar.xz",
}
# macOS（Apple Silicon）: Martin Riedl 氏の静的ビルド。URL に版が入っているので、この版に固定する
MAC_BASE = "https://ffmpeg.martin-riedl.de/download/macos/arm64/1789931890_9.0.2"
FFMPEG_SOURCE = "https://ffmpeg.org/releases/ffmpeg-9.0.2.tar.xz"

TOOLS = ("ffmpeg", "ffprobe")


def executable(name: str) -> str:
    return f"{name}.exe" if platform.system() == "Windows" else name


def download(url: str) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": "omoide-build"})
    with urllib.request.urlopen(request, timeout=300) as response:
        return response.read()


def verify(data: bytes, expected: str, name: str) -> None:
    actual = hashlib.sha256(data).hexdigest()
    if actual != expected.lower():
        sys.exit(f"{name} のハッシュ値が合いません（期待 {expected}、実際 {actual}）")


def place(name: str, data: bytes) -> None:
    path = OUT / name
    path.write_bytes(data)
    path.chmod(path.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)


def fetch_btbn(asset: str) -> str:
    release = json.loads(download(BTBN_RELEASE))
    urls = {a["name"]: a["browser_download_url"] for a in release["assets"]}
    checksums = download(urls["checksums.sha256"]).decode()
    expected = next(line.split()[0] for line in checksums.splitlines() if line.rstrip().endswith(asset))
    data = download(urls[asset])
    verify(data, expected, asset)
    wanted = {executable(t) for t in TOOLS} | {"LICENSE.txt"}
    if asset.endswith(".zip"):
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            for member in archive.namelist():
                if Path(member).name in wanted and not member.endswith("/"):
                    place(Path(member).name, archive.read(member))
    else:
        with tarfile.open(fileobj=io.BytesIO(data), mode="r:xz") as archive:
            for member in archive.getmembers():
                if member.isfile() and Path(member.name).name in wanted:
                    place(Path(member.name).name, archive.extractfile(member).read())
    return (
        f"FFmpeg 9.0 系（GPL 版、静的リンク）: {asset}\n"
        "ビルド: https://github.com/BtbN/FFmpeg-Builds （ビルドの手順とスクリプト）\n"
        f"取得元: {urls[asset]}\n"
        "FFmpeg のソース: https://git.ffmpeg.org/ffmpeg.git の release/9.0 ブランチ（https://ffmpeg.org/download.html）\n"
    )


def fetch_mac() -> str:
    for name in TOOLS:
        data = download(f"{MAC_BASE}/{name}.zip")
        verify(data, download(f"{MAC_BASE}/{name}.zip.sha256").decode().split()[0], f"{name}.zip")
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            member = next(m for m in archive.namelist() if Path(m).name == name)
            place(name, archive.read(member))
    return (
        "FFmpeg 9.0.2（GPL 版、静的リンク、macOS arm64）\n"
        "ビルド: https://ffmpeg.martin-riedl.de/ （ビルドのスクリプト: https://git.martin-riedl.de/ffmpeg/build-script）\n"
        f"取得元: {MAC_BASE}/ffmpeg.zip、{MAC_BASE}/ffprobe.zip\n"
        f"FFmpeg のソース: {FFMPEG_SOURCE}\n"
    )


def copy_local() -> str:
    for name in TOOLS:
        found = shutil.which(name)
        if found is None:
            sys.exit(f"{name} が PATH にありません")
        shutil.copy2(found, OUT / executable(name))
    return "手元の確認用に、PATH の ffmpeg・ffprobe をコピーした（配布には使わない）\n"


def main() -> None:
    shutil.rmtree(OUT, ignore_errors=True)
    OUT.mkdir(parents=True)
    system, machine = platform.system(), platform.machine()
    if "--local" in sys.argv:
        source = copy_local()
    elif system == "Darwin" and machine == "arm64":
        source = fetch_mac()
    elif (system, machine) in BTBN_ASSETS:
        source = fetch_btbn(BTBN_ASSETS[(system, machine)])
    else:
        sys.exit(f"この OS・CPU（{system} {machine}）向けの ffmpeg は用意していません")
    (OUT / "SOURCE.txt").write_text(source, encoding="utf-8")
    print(source)


if __name__ == "__main__":
    main()
