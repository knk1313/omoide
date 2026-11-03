"""入力フォルダから動画を探し、時系列に並べる。"""

from datetime import datetime, timezone
from pathlib import Path

from .probe import VideoInfo, probe

VIDEO_SUFFIXES = {".mp4", ".mov"}


def find_videos(folder: Path) -> list[VideoInfo]:
    paths = [
        p for p in folder.iterdir()
        if p.is_file() and p.suffix.lower() in VIDEO_SUFFIXES and not p.name.startswith(".")
    ]
    return sorted((probe(p) for p in paths), key=_sort_key)


def _sort_key(info: VideoInfo) -> tuple[datetime, str]:
    # 動画メタデータの作成日時を優先し、無ければファイルの更新日時を使う
    created = info.created_at or datetime.fromtimestamp(info.path.stat().st_mtime, timezone.utc)
    if created.tzinfo is None:
        created = created.replace(tzinfo=timezone.utc)
    return created, info.path.name
