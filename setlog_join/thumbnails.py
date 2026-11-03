"""中身のあるパネルごとに、スマホの一覧で使うサムネイルを作る。

動画が変わっていなければ作り直さない。
"""

import json
import shutil
from pathlib import Path

from . import ffmpeg
from .cache import file_stamp, video_key
from .scan import VideoScan

THUMBNAIL_DIR = Path(".setlog-join/thumbnails")
# 2 列のタイル (幅約 175pt) を 3 倍の画素密度で表示しても粗く見えない大きさ
THUMBNAIL_WIDTH = 640
# 切り出し方や画質を変えたら上げる。古いサムネイルは作り直す
THUMBNAIL_VERSION = 2
_STAMP_FILE = "stamp.json"


def ensure_thumbnails(scan: VideoScan, thumbnail_dir: Path = THUMBNAIL_DIR) -> Path:
    """サムネイルをそろえ、置いたフォルダを返す。ファイル名は `<クリップ番号>-<パネル番号>.jpg`。"""
    video_dir = thumbnail_dir / video_key(scan.info)
    stamp = {"version": THUMBNAIL_VERSION, **file_stamp(scan.info)}
    stamp_path = video_dir / _STAMP_FILE
    if _read_stamp(stamp_path) != stamp and video_dir.exists():
        # 動画が変わったら、今は空になったパネルの画像も残さないよう丸ごと作り直す
        shutil.rmtree(video_dir)
    video_dir.mkdir(parents=True, exist_ok=True)

    for scanned in scan.clips:
        middle = (scanned.clip.start + scanned.clip.end) / 2
        for panel in scanned.filled:
            out = video_dir / f"{scanned.clip.index:03d}-{panel.position + 1}.jpg"
            if out.exists():
                continue
            ffmpeg.run(
                "-y", "-ss", f"{middle:.3f}", "-i", str(scan.info.path), "-frames:v", "1",
                "-vf", f"{panel.crop_filter},scale={THUMBNAIL_WIDTH}:-2",
                "-q:v", "4", str(out),
            )
    stamp_path.write_text(json.dumps(stamp))
    return video_dir


def _read_stamp(path: Path) -> dict | None:
    try:
        return json.loads(path.read_text())
    except (OSError, ValueError):
        return None
