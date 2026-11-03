"""スマホから送られた動画を入力フォルダに保存する。

送り途中で切れても、作りかけのファイルを入力フォルダの動画として残さない。
"""

import re
import shutil
import unicodedata
from collections.abc import AsyncIterator
from pathlib import Path

from .inputs import VIDEO_SUFFIXES

MAX_UPLOAD_BYTES = 2 * 1024**3
# 取り込んだ後の解析で作るサムネイルや単体再生の動画の分も見込む
_SPACE_MARGIN = 200 * 1024**2
_PART_SUFFIX = ".part"


class UploadError(Exception):
    """受け取れない。メッセージは利用者向け。status は返す HTTP ステータス。"""

    def __init__(self, message: str, status: int):
        super().__init__(message)
        self.status = status


def upload_path(raw_name: str, folder: Path) -> Path:
    """保存先。名前から危ない文字を除き、入力フォルダの動画と名前 (拡張子を除く部分) が重ならないようにする。"""
    name = unicodedata.normalize("NFC", Path(raw_name.replace("\\", "/")).name)
    suffix = Path(name).suffix.lower()
    if suffix not in VIDEO_SUFFIXES:
        raise UploadError("MP4かMOVの動画を選んでください", 415)
    # パネルの ID (`<動画名>/<クリップ>-<パネル>`) と URL に使うので、区切りに紛れる文字を避ける
    stem = re.sub(r"[^\w\-]+", "_", Path(name).stem).strip("_.") or "video"
    taken = {p.stem for p in folder.iterdir() if p.suffix.lower() in VIDEO_SUFFIXES} if folder.is_dir() else set()
    candidate, n = stem, 2
    while candidate in taken:
        candidate, n = f"{stem}-{n}", n + 1
    return folder / f"{candidate}{suffix}"


async def save_upload(chunks: AsyncIterator[bytes], size: int | None, destination: Path) -> None:
    """届いた分から順にファイルへ書く。大きすぎる・空き容量が足りない・途中で切れたときは UploadError。"""
    if size is None:
        raise UploadError("動画の大きさが分かりません。もう一度選び直してください", 411)
    if size > MAX_UPLOAD_BYTES:
        raise UploadError(f"動画が大きすぎます（{MAX_UPLOAD_BYTES // 1024**3}GBまで）", 413)
    destination.parent.mkdir(parents=True, exist_ok=True)
    if shutil.disk_usage(destination.parent).free < size + _SPACE_MARGIN:
        raise UploadError("Macの空き容量が足りません。不要なファイルを削除してから、もう一度お試しください", 507)

    part = destination.with_name(destination.name + _PART_SUFFIX)
    received = 0
    try:
        with part.open("wb") as out:
            async for chunk in chunks:
                received += len(chunk)
                if received > size:
                    raise UploadError("動画の大きさが送られた値と合いません。もう一度お試しください", 400)
                out.write(chunk)
        if received != size:
            raise UploadError("送っている途中で接続が切れました。もう一度お試しください", 400)
        # 届き終えてから名前を付けるので、作りかけが入力フォルダの動画として読まれることはない
        part.replace(destination)
    except BaseException:
        part.unlink(missing_ok=True)
        raise
