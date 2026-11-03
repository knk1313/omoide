"""中身のあるパネルを、クリップごとの動画として書き出す。"""

import shutil
from collections.abc import Sequence
from pathlib import Path

from . import ffmpeg
from .panels import Panel
from .probe import VideoInfo
from .scan import VideoScan
from .segments import Clip


def export_video(scan: VideoScan, export_dir: Path) -> None:
    video_dir = export_dir / scan.info.path.stem
    if video_dir.exists():
        # 前回の書き出し結果 (今回は空と判定されたパネルを含む) を残さない
        shutil.rmtree(video_dir)
    for scanned in scan.clips:
        for panel in scanned.filled:
            out = video_dir / f"{scanned.clip.index:03d}-{panel.position + 1}.mp4"
            export_panel_clip(scan.info, scan.panel_clip(scanned, panel), panel, out)


def export_panel_clip(
    info: VideoInfo, clip: Clip, panel: Panel, out_path: Path, filters: Sequence[str] = (),
) -> None:
    """パネルを切り出して書き出す。filters は切り出しの後に続けて掛ける映像フィルタ。"""
    out_path.parent.mkdir(parents=True, exist_ok=True)
    ffmpeg.run(
        "-y",
        "-ss", f"{clip.start:.3f}", "-t", f"{clip.duration:.3f}", "-i", str(info.path),
        "-vf", ",".join([panel.crop_filter, *filters]), "-an",
        "-c:v", "libx264", "-pix_fmt", "yuv420p",
        str(out_path),
    )
