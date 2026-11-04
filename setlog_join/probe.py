"""ffprobe で動画のメタデータを取得する。"""

import json
import subprocess
from dataclasses import dataclass
from datetime import datetime
from fractions import Fraction
from pathlib import Path

from .runtime import tool


@dataclass(frozen=True)
class VideoInfo:
    path: Path
    duration: float
    fps: float
    width: int
    height: int
    created_at: datetime | None


def probe(path: Path) -> VideoInfo:
    result = subprocess.run(
        [
            tool("ffprobe"), "-v", "error",
            "-select_streams", "v:0",
            "-show_entries", "stream=width,height,avg_frame_rate:format=duration:format_tags=creation_time",
            "-of", "json",
            str(path),
        ],
        capture_output=True, text=True, check=True,
    )
    data = json.loads(result.stdout)
    if not data.get("streams"):
        raise ValueError(f"映像ストリームがありません: {path}")
    stream = data["streams"][0]
    fmt = data.get("format", {})
    return VideoInfo(
        path=path,
        duration=float(fmt["duration"]),
        fps=float(Fraction(stream["avg_frame_rate"])),
        width=int(stream["width"]),
        height=int(stream["height"]),
        created_at=_parse_time(fmt.get("tags", {}).get("creation_time")),
    )


def _parse_time(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
