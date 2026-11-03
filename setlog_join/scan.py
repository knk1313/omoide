"""1 本の書き出し動画を、クリップと人ごとのパネルに分解する。"""

from dataclasses import dataclass

import numpy as np

from .panels import Panel, detect_panels, is_empty, read_gray_frame
from .probe import VideoInfo
from .segments import Clip, split_video


@dataclass(frozen=True)
class ScannedClip:
    clip: Clip
    # 中身のあるパネル。時刻と zZ だけの空カードは含めない
    filled: list[Panel]


@dataclass(frozen=True)
class VideoScan:
    info: VideoInfo
    panels: list[Panel]
    clips: list[ScannedClip]

    @property
    def candidate_count(self) -> int:
        return sum(len(c.filled) for c in self.clips)


def scan_video(info: VideoInfo) -> VideoScan:
    """カードを 3 段検出できなければ ValueError を送出する。"""
    clips = split_video(info)
    frames = [read_gray_frame(info, (clip.start + clip.end) / 2) for clip in clips]
    # 空カードと中身のあるカードが混ざっても枠を拾えるよう、画素ごとの最大値で検出する
    panels = detect_panels(np.maximum.reduce(frames))
    return VideoScan(
        info=info,
        panels=panels,
        clips=[
            ScannedClip(clip=clip, filled=[p for p in panels if not is_empty(frame, p)])
            for clip, frame in zip(clips, frames)
        ],
    )
