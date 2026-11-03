"""中身のあるパネルを、クリップごとの動画として書き出す。"""

import shutil
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
            export_panel_clip(scan.info, scanned.clip, panel, out)


def export_panel_clip(info: VideoInfo, clip: Clip, panel: Panel, out_path: Path) -> None:
    out_path.parent.mkdir(parents=True, exist_ok=True)
    ffmpeg.run(
        "-y",
        "-ss", f"{clip.start:.3f}", "-t", f"{clip.duration:.3f}", "-i", str(info.path),
        "-vf", panel.crop_filter, "-an",
        "-c:v", "libx264", "-pix_fmt", "yuv420p",
        str(out_path),
    )
