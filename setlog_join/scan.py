"""1 本の書き出し動画を、クリップと人ごとのパネルに分解する。"""

from dataclasses import dataclass, field

import numpy as np

from .panels import Panel, black_edges, detect_panels, is_empty, read_gray_frame
from .probe import VideoInfo
from .segments import Clip, detect_clips, frame_diffs, read_small_frames


@dataclass(frozen=True)
class ScannedClip:
    clip: Clip
    # 中身のあるパネル。時刻と zZ だけの空カードは含めない
    filled: list[Panel]
    # パネルの位置 → 先頭と末尾で削る黒いフレームの数。削らないパネルは含めない
    black_edges: dict[int, tuple[int, int]] = field(default_factory=dict)


@dataclass(frozen=True)
class VideoScan:
    info: VideoInfo
    panels: list[Panel]
    clips: list[ScannedClip]

    @property
    def candidate_count(self) -> int:
        return sum(len(c.filled) for c in self.clips)

    def panel_clip(self, scanned: ScannedClip, panel: Panel) -> Clip:
        """そのパネルで使う区間。先頭と末尾の黒いフレームを除く。"""
        head, tail = scanned.black_edges.get(panel.position, (0, 0))
        clip = scanned.clip
        fps = self.info.fps
        return Clip(index=clip.index, start=clip.start + head / fps, end=clip.end - tail / fps)


def scan_video(info: VideoInfo) -> VideoScan:
    """カードを 3 段検出できなければ ValueError を送出する。"""
    small_frames = read_small_frames(info.path)
    clips = detect_clips(frame_diffs(small_frames), info.fps)
    frames = [read_gray_frame(info, (clip.start + clip.end) / 2) for clip in clips]
    # 空カードと中身のあるカードが混ざっても枠を拾えるよう、画素ごとの最大値で検出する
    panels = detect_panels(np.maximum.reduce(frames))

    scanned = []
    for clip, frame in zip(clips, frames):
        filled = [p for p in panels if not is_empty(frame, p)]
        start, end = round(clip.start * info.fps), round(clip.end * info.fps)
        edges = {}
        for panel in filled:
            head, tail = black_edges(small_frames, panel, info.width, info.height, start, end)
            if head or tail:
                edges[panel.position] = (head, tail)
        scanned.append(ScannedClip(clip=clip, filled=filled, black_edges=edges))
    return VideoScan(info=info, panels=panels, clips=scanned)
