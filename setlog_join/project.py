"""採用・除外と速度を .setlog-join/projects/project.json に保存し、再読み込みや再起動の後も保つ。

解析結果は cache.py が持つので、ここには利用者が決めた内容だけを置く。
除外したパネルだけを記録し、記録の無いパネルは採用とみなす。動画を追加しても、新しいパネルは採用になり、
これまでの除外はそのまま残る。
"""

import json
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path

from .join import SPEEDS, PanelRef
from .scan import VideoScan

PROJECT_PATH = Path(".setlog-join/projects/project.json")
PROJECT_VERSION = 1


@dataclass
class Project:
    speed: float = 1.0
    # 除外したパネルの ID (`<動画名>/<クリップ番号>-<パネル番号>`)
    excluded: set[str] = field(default_factory=set)
    # 動画名 → 利用者が入力した撮影日 (`2026-09-19`)。入力していない動画は含めない
    video_dates: dict[str, str] = field(default_factory=dict)

    def is_selected(self, ref: PanelRef) -> bool:
        return str(ref) not in self.excluded

    def set_selected(self, ref: PanelRef, selected: bool) -> None:
        if selected:
            self.excluded.discard(str(ref))
        else:
            self.excluded.add(str(ref))

    def selected_refs(self, scans: list[VideoScan]) -> list[PanelRef]:
        """中身のあるパネルのうち、除外していないもの。"""
        return [ref for ref in panel_refs(scans) if self.is_selected(ref)]


def panel_refs(scans: list[VideoScan]) -> list[PanelRef]:
    """中身のあるパネルすべての ID。"""
    return [
        PanelRef(scan.info.path.stem, scanned.clip.index, panel.position + 1)
        for scan in scans
        for scanned in scan.clips
        for panel in scanned.filled
    ]


def is_date(value: str) -> bool:
    """`2026-09-19` の形の、実在する日付か。"""
    try:
        return date.fromisoformat(value).isoformat() == value
    except ValueError:
        return False


def load_project(path: Path = PROJECT_PATH) -> Project:
    """保存した内容を読む。無い・壊れている・形式が古いときは、すべて採用・等速として始める。"""
    try:
        data = json.loads(path.read_text())
        if data["version"] != PROJECT_VERSION:
            return Project()
        speed = float(data["speed"])
        dates = data.get("video_dates", {})
        return Project(
            speed=speed if speed in SPEEDS else 1.0,
            excluded={str(ref) for ref in data["excluded"]},
            # 日付を後から足したので、無いファイルも読めるようにする。形の正しいものだけを使う
            video_dates={str(k): str(v) for k, v in dates.items() if is_date(str(v))} if isinstance(dates, dict) else {},
        )
    except (OSError, ValueError, KeyError, TypeError):
        return Project()


def save_project(project: Project, path: Path = PROJECT_PATH) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    data = {
        "version": PROJECT_VERSION,
        "speed": project.speed,
        "excluded": sorted(project.excluded),
        "video_dates": dict(sorted(project.video_dates.items())),
    }
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2))
    # 書き込み途中で止まっても壊れたファイルが残らないよう、書き終えてから置き換える
    tmp.replace(path)
