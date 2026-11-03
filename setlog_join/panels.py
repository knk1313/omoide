"""縦に 3 人分並んだカードを検出し、人ごとのパネルとして切り出す。

Setlog の書き出しは、黒背景の上に角丸のカードが余白付きで 3 段並ぶ。
その日の動画が無い人のカードは、無地のグレーに時刻と「zZ」だけが表示される。
"""

import math
from dataclasses import dataclass

import numpy as np

from . import ffmpeg
from .probe import VideoInfo

PANEL_COUNT = 3
# 上から順に、書き出しに並んでいる人を呼ぶ名前
PANEL_LABELS = ("ユーザー1", "ユーザー2", "ユーザー3")

# 背景 (輝度 0) とカード (空でも輝度 20 前後) を分けるしきい値
_BACKGROUND_MAX = 8
# 中央値から外れた画素がこの割合未満なら、時刻と zZ だけの空カードとみなす
_EMPTY_RATIO = 0.05
_EMPTY_TOLERANCE = 12
# カードの中身がこの輝度以下なら、映像が描かれていない黒いフレームとみなす
_BLACK_MAX = 3
# 黒いフレームとして削るのは、パネルの先頭と末尾それぞれこのフレーム数まで。暗い映像を削りすぎないため
MAX_BLACK_EDGE_FRAMES = 3


@dataclass(frozen=True)
class Panel:
    position: int
    x: int
    y: int
    width: int
    height: int

    @property
    def label(self) -> str:
        return PANEL_LABELS[self.position]

    @property
    def crop_filter(self) -> str:
        return f"crop={self.width}:{self.height}:{self.x}:{self.y}"

    def region(self, frame: np.ndarray) -> np.ndarray:
        return frame[self.y:self.y + self.height, self.x:self.x + self.width]


def read_gray_frame(info: VideoInfo, seconds: float) -> np.ndarray:
    return ffmpeg.gray_frames(
        "-ss", f"{seconds:.3f}", "-i", str(info.path), "-frames:v", "1",
        width=info.width, height=info.height,
    )[0]


def detect_panels(frame: np.ndarray) -> list[Panel]:
    """背景より明るい帯をカードとみなし、角丸が入らない内側の矩形を返す。

    空カードと中身のあるカードが混ざっても検出できるよう、複数フレームの画素ごとの最大値を渡す。
    """
    card = frame > _BACKGROUND_MAX
    rows = _runs(card.mean(axis=1) > 0.5)
    if len(rows) != PANEL_COUNT:
        raise ValueError(f"カードを {PANEL_COUNT} 段検出できませんでした (検出数: {len(rows)})")
    columns = np.flatnonzero(card.mean(axis=0) > 0.5)
    left, right = int(columns[0]), int(columns[-1]) + 1

    top = rows[0][0]
    inset = _corner_inset(card, left, top) + 2

    panels = []
    for position, (y0, y1) in enumerate(rows):
        # H.264 の 4:2:0 に合わせて位置とサイズを偶数にそろえる
        x = _even_up(left + inset)
        y = _even_up(y0 + inset)
        panels.append(Panel(
            position=position, x=x, y=y,
            width=_even_down(right - inset - x),
            height=_even_down(y1 - inset - y),
        ))
    return panels


def is_empty(frame: np.ndarray, panel: Panel) -> bool:
    region = panel.region(frame).astype(np.int16)
    off = np.abs(region - np.median(region)) > _EMPTY_TOLERANCE
    return off.mean() < _EMPTY_RATIO


def black_edges(small_frames: np.ndarray, panel: Panel, frame_width: int, frame_height: int,
                start: int, end: int) -> tuple[int, int]:
    """フレーム start〜end-1 のうち、パネルの先頭と末尾に続く黒いフレームの数を返す。

    Setlog では、ある人の素材がほかの人より短いと、カードの中身が描かれず黒いまま書き出される。
    small_frames は縮小した全フレーム。パネルの位置は元の解像度 (frame_width x frame_height) で渡す。
    """
    rows, cols = small_frames.shape[1:]
    # 縮小で枠の外の背景が混ざらないよう、内側に切り詰める
    x0 = math.ceil(panel.x * cols / frame_width) + 1
    x1 = (panel.x + panel.width) * cols // frame_width - 1
    y0 = math.ceil(panel.y * rows / frame_height) + 1
    y1 = (panel.y + panel.height) * rows // frame_height - 1
    region = small_frames[start:end, y0:y1, x0:x1].reshape(end - start, -1)
    black = np.median(region, axis=1) <= _BLACK_MAX

    limit = min(MAX_BLACK_EDGE_FRAMES, (end - start - 1) // 2)
    return _leading_true(black, limit), _leading_true(black[::-1], limit)


def _leading_true(flags: np.ndarray, limit: int) -> int:
    count = 0
    while count < limit and flags[count]:
        count += 1
    return count


def _runs(mask: np.ndarray) -> list[tuple[int, int]]:
    edges = np.flatnonzero(np.diff(np.concatenate(([0], mask.astype(np.int8), [0]))))
    return list(zip(edges[::2].tolist(), edges[1::2].tolist()))


def _corner_inset(card: np.ndarray, left: int, top: int) -> int:
    # 左上の角から対角線方向に進み、角丸の弧に当たるまでの距離
    for d in range(min(card.shape) // 2):
        if card[top + d, left + d]:
            return d
    return 0


def _even_up(n: int) -> int:
    return n + n % 2


def _even_down(n: int) -> int:
    return n - n % 2
