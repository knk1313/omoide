"""採用したパネルを人ごとにつなぎ、速度を変えて 1 本の動画にする。"""

import re
import tempfile
from dataclasses import dataclass
from pathlib import Path

from . import ffmpeg
from .export import export_panel_clip
from .panels import Panel
from .probe import VideoInfo
from .scan import VideoScan
from .segments import Clip

SPEEDS = (0.5, 1.0, 1.5, 2.0)

_REF_PATTERN = re.compile(r"^(?P<video>.+)/(?P<clip>\d+)-(?P<panel>\d+)$")


class SelectionError(ValueError):
    """指定されたパネルを使えない。problems に理由を 1 件ずつ持つ。"""

    def __init__(self, problems: list[str]):
        super().__init__("\n".join(problems))
        self.problems = problems


@dataclass(frozen=True)
class PanelRef:
    """`<動画名>/<クリップ番号>-<パネル番号>` で指定するパネル。scan --export のファイル名と同じ形。"""

    video: str
    clip: int
    panel: int

    @classmethod
    def parse(cls, text: str) -> "PanelRef":
        match = _REF_PATTERN.match(text.strip())
        if match is None:
            raise SelectionError([f"{text}: `<動画名>/<クリップ番号>-<パネル番号>` の形で指定してください"])
        return cls(match["video"], int(match["clip"]), int(match["panel"]))

    def __str__(self) -> str:
        return f"{self.video}/{self.clip:03d}-{self.panel}"


@dataclass(frozen=True)
class Segment:
    info: VideoInfo
    clip: Clip
    panel: Panel


def resolve_segments(scans: list[VideoScan], refs: list[PanelRef] | None) -> list[Segment]:
    """つなぐパネルを人ごと (上 → 中 → 下)、各人の中では時系列に並べて返す。

    refs が None なら、中身のあるパネルをすべて使う。使えない指定があれば、まとめて SelectionError にする。
    """
    if refs is None:
        segments = [
            Segment(scan.info, scan.panel_clip(scanned, panel), panel)
            for scan in scans
            for scanned in scan.clips
            for panel in scanned.filled
        ]
    else:
        segments = _lookup(scans, refs)
    if not segments:
        raise SelectionError(["つなげるパネルがありません。中身のあるパネルを指定してください"])

    order = {scan.info.path: i for i, scan in enumerate(scans)}
    return sorted(segments, key=lambda s: (s.panel.position, order[s.info.path], s.clip.index))


def join_segments(segments: list[Segment], speed: float, out_path: Path) -> None:
    """パネルを 1 本ずつ同じ形式に変換してから、再エンコードせずにつなぐ。"""
    if speed not in SPEEDS:
        raise ValueError(f"速度は {', '.join(f'{s:g}' for s in SPEEDS)} のどれかにしてください: {speed:g}")
    # 動画ごとにパネルの解像度が違っても、最初のパネルの大きさに縦横比を保って収め、余白は黒で埋める
    width, height = segments[0].panel.width, segments[0].panel.height
    fps = segments[0].info.fps
    filters = [
        f"scale={width}:{height}:force_original_aspect_ratio=decrease",
        f"pad={width}:{height}:(ow-iw)/2:(oh-ih)/2",
        "setsar=1",
        f"setpts=PTS/{speed:g}",
        # 速度を変えてもフレームレートをそろえ、つなぎ目で再生がずれないようにする
        f"fps={fps:g}",
    ]

    out_path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        parts = []
        for i, segment in enumerate(segments):
            part = Path(tmp) / f"{i:05d}.mp4"
            export_panel_clip(segment.info, segment.clip, segment.panel, part, filters)
            parts.append(part)
        concat_list = Path(tmp) / "concat.txt"
        concat_list.write_text("".join(f"file '{p.name}'\n" for p in parts))
        ffmpeg.run("-y", "-f", "concat", "-safe", "0", "-i", str(concat_list), "-c", "copy", str(out_path))


def _lookup(scans: list[VideoScan], refs: list[PanelRef]) -> list[Segment]:
    by_video = {scan.info.path.stem: scan for scan in scans}
    segments = []
    problems = []
    for ref in refs:
        scan = by_video.get(ref.video)
        if scan is None:
            problems.append(f"{ref}: 動画 {ref.video} が入力フォルダにありません")
            continue
        scanned = next((c for c in scan.clips if c.clip.index == ref.clip), None)
        if scanned is None:
            problems.append(f"{ref}: クリップ {ref.clip} がありません (1〜{len(scan.clips)})")
            continue
        panel = next((p for p in scan.panels if p.position == ref.panel - 1), None)
        if panel is None:
            problems.append(f"{ref}: パネル番号は 1〜{len(scan.panels)} で指定してください")
        elif panel not in scanned.filled:
            problems.append(f"{ref}: 中身のないパネルです")
        else:
            segments.append(Segment(scan.info, scan.panel_clip(scanned, panel), panel))
    if problems:
        raise SelectionError(problems)
    # 同じパネルを 2 回指定しても 1 回だけ使う
    return list(dict.fromkeys(segments))
