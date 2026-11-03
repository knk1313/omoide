"""約 2 秒ごとのクリップ境界を検出する。

公称 2 秒ごとの位置を中心に探索窓を設け、窓内でフレーム差分が最大になる位置を実境界とする。
"""

from dataclasses import dataclass
from pathlib import Path

import numpy as np

from . import ffmpeg
from .probe import VideoInfo

CLIP_SECONDS = 2.0
WINDOW_SECONDS = 0.5
_FRAME_W, _FRAME_H = 64, 36


@dataclass(frozen=True)
class Clip:
    index: int
    start: float
    end: float

    @property
    def duration(self) -> float:
        return self.end - self.start


def frame_diffs(path: Path) -> np.ndarray:
    """diffs[i] はフレーム i-1 と i の平均輝度差。diffs[0] は 0。"""
    frames = ffmpeg.gray_frames(
        "-i", str(path), "-vf", f"scale={_FRAME_W}:{_FRAME_H}",
        width=_FRAME_W, height=_FRAME_H,
    ).reshape(-1, _FRAME_H * _FRAME_W)
    diffs = np.zeros(len(frames))
    if len(frames) > 1:
        diffs[1:] = np.abs(np.diff(frames.astype(np.int16), axis=0)).mean(axis=1)
    return diffs


def detect_clips(
    diffs: np.ndarray,
    fps: float,
    clip_seconds: float = CLIP_SECONDS,
    window_seconds: float = WINDOW_SECONDS,
) -> list[Clip]:
    frame_count = len(diffs)
    window = max(1, round(window_seconds * fps))
    step = round(clip_seconds * fps)

    # 直前の実境界から 2 秒先を探すので、クリップ長のずれが蓄積しない
    cuts = [0]
    while (nominal := cuts[-1] + step) < frame_count - window:
        lo = max(cuts[-1] + 1, nominal - window)
        hi = min(frame_count, nominal + window + 1)
        cuts.append(lo + int(np.argmax(diffs[lo:hi])))
    cuts.append(frame_count)

    return [
        Clip(index=i + 1, start=a / fps, end=b / fps)
        for i, (a, b) in enumerate(zip(cuts, cuts[1:]))
    ]


def split_video(info: VideoInfo) -> list[Clip]:
    return detect_clips(frame_diffs(info.path), info.fps)
