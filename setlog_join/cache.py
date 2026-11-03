"""動画 1 本ごとの解析結果を .setlog-join/cache/ に保存し、次回の解析を省く。

動画のファイルサイズと更新日時が変わったら解析し直す。
"""

import hashlib
import json
from pathlib import Path

from .panels import Panel
from .probe import VideoInfo
from .scan import ScannedClip, VideoScan, scan_video
from .segments import Clip

CACHE_DIR = Path(".setlog-join/cache")
# 境界検出・カード検出・空判定のロジックを変えたら上げる。古いキャッシュは使わなくなる
CACHE_VERSION = 2


def load_or_scan(info: VideoInfo, cache_dir: Path = CACHE_DIR) -> VideoScan:
    """キャッシュが使えればそれを返し、無ければ解析して保存する。"""
    path = _cache_path(info, cache_dir)
    stamp = file_stamp(info)
    try:
        data = json.loads(path.read_text())
        if data["version"] == CACHE_VERSION and data["stamp"] == stamp:
            return _decode(info, data)
    except (OSError, ValueError, KeyError, TypeError):
        pass  # 無い・壊れている・古いキャッシュは使わずに解析し直す

    scan = scan_video(info)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps({"version": CACHE_VERSION, "stamp": stamp, **_encode(scan)}))
    # 書き込み途中で止まっても壊れたキャッシュが残らないよう、書き終えてから置き換える
    tmp.replace(path)
    return scan


def video_key(info: VideoInfo) -> str:
    """動画ごとの生成物の名前。同じ名前の動画が別のフォルダにあっても衝突しない。"""
    digest = hashlib.sha256(str(info.path.resolve()).encode()).hexdigest()[:16]
    return f"{info.path.stem}-{digest}"


def file_stamp(info: VideoInfo) -> dict[str, int]:
    """動画が変わったかを判定する値。中身を読まずに済むよう、サイズと更新日時を使う。"""
    stat = info.path.stat()
    return {"size": stat.st_size, "mtime_ns": stat.st_mtime_ns}


def _cache_path(info: VideoInfo, cache_dir: Path) -> Path:
    return cache_dir / f"{video_key(info)}.json"


def _encode(scan: VideoScan) -> dict:
    return {
        "panels": [
            {"position": p.position, "x": p.x, "y": p.y, "width": p.width, "height": p.height}
            for p in scan.panels
        ],
        "clips": [
            {
                "index": c.clip.index, "start": c.clip.start, "end": c.clip.end,
                "filled": [p.position for p in c.filled],
                "black_edges": {str(position): list(edge) for position, edge in c.black_edges.items()},
            }
            for c in scan.clips
        ],
    }


def _decode(info: VideoInfo, data: dict) -> VideoScan:
    panels = [Panel(**p) for p in data["panels"]]
    by_position = {p.position: p for p in panels}
    clips = [
        ScannedClip(
            clip=Clip(index=c["index"], start=c["start"], end=c["end"]),
            filled=[by_position[position] for position in c["filled"]],
            black_edges={int(position): tuple(edge) for position, edge in c["black_edges"].items()},
        )
        for c in data["clips"]
    ]
    return VideoScan(info=info, panels=panels, clips=clips)
