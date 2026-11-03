"""serve の間、解析結果と利用者の選択をまとめて持ち、API から読み書きする。

API ではパネルを ID で指定させ、ファイルのパスはここで ID から組み立てる。利用者にパスを指定させない。
"""

import hashlib
import json
import shutil
import threading
from dataclasses import dataclass
from pathlib import Path

from .cache import CACHE_VERSION, file_stamp, video_key
from .export import export_panel_clip
from .join import SPEEDS, PanelRef, Segment, resolve_segments
from .panels import Panel
from .project import PROJECT_PATH, Project, load_project, save_project
from .scan import ScannedClip, VideoScan
from .segments import Clip
from .thumbnails import THUMBNAIL_DIR

CLIP_DIR = Path(".setlog-join/clips")


@dataclass(frozen=True)
class PanelEntry:
    ref: PanelRef
    scan: VideoScan
    scanned: ScannedClip
    panel: Panel

    @property
    def id(self) -> str:
        return str(self.ref)

    @property
    def clip(self) -> Clip:
        """黒いフレームを除いた、このパネルで使う区間。"""
        return self.scan.panel_clip(self.scanned, self.panel)


class Workspace:
    def __init__(
        self,
        scans: list[VideoScan],
        project_path: Path = PROJECT_PATH,
        thumbnail_dir: Path = THUMBNAIL_DIR,
        clip_dir: Path = CLIP_DIR,
    ):
        self.scans = scans
        self._project_path = project_path
        self._thumbnail_dir = thumbnail_dir
        self._clip_dir = clip_dir
        self.project = load_project(project_path)
        # 時系列の順 (動画 → クリップ → パネル) に並べる
        self.entries: dict[str, PanelEntry] = {}
        for scan in scans:
            for scanned in scan.clips:
                for panel in scanned.filled:
                    entry = PanelEntry(PanelRef(scan.info.path.stem, scanned.clip.index, panel.position + 1),
                                       scan, scanned, panel)
                    self.entries[entry.id] = entry
        # API はスレッドプールで並行に呼ばれるので、選択の更新と動画の生成をそれぞれ直列にする
        self._project_lock = threading.Lock()
        self._media_lock = threading.Lock()

    def get(self, panel_id: str) -> PanelEntry:
        """存在しない ID なら KeyError。"""
        return self.entries[panel_id]

    def is_selected(self, entry: PanelEntry) -> bool:
        return self.project.is_selected(entry.ref)

    def set_selected(self, panel_id: str, selected: bool) -> None:
        entry = self.get(panel_id)
        with self._project_lock:
            self.project.set_selected(entry.ref, selected)
            save_project(self.project, self._project_path)

    def select_all(self, selected: bool) -> None:
        with self._project_lock:
            for entry in self.entries.values():
                self.project.set_selected(entry.ref, selected)
            save_project(self.project, self._project_path)

    def set_speed(self, speed: float) -> None:
        if speed not in SPEEDS:
            raise ValueError(f"速度は {', '.join(f'{s:g}' for s in SPEEDS)} のどれかにしてください")
        with self._project_lock:
            self.project.speed = speed
            save_project(self.project, self._project_path)

    def summary(self) -> dict:
        selected = [e for e in self.entries.values() if self.is_selected(e)]
        seconds = sum(e.clip.duration for e in selected)
        return {
            "speed": self.project.speed,
            "total_count": len(self.entries),
            "selected_count": len(selected),
            "estimated_seconds": round(seconds / self.project.speed, 2),
            "videos": [
                {
                    "name": scan.info.path.stem,
                    "created_at": scan.info.created_at.isoformat() if scan.info.created_at else None,
                    "panel_count": scan.candidate_count,
                }
                for scan in self.scans
            ],
        }

    def selected_segments(self) -> list[Segment]:
        """採用したパネルを、つなぐ順 (人ごと、各人の中では時系列) に並べる。無ければ SelectionError。"""
        return resolve_segments(self.scans, self.project.selected_refs(self.scans))

    def clear_clips(self) -> None:
        """パネル単体の動画を消す。次に要求されたときに作り直す。"""
        with self._media_lock:
            shutil.rmtree(self._clip_dir, ignore_errors=True)

    def thumbnail_path(self, entry: PanelEntry) -> Path:
        return self._thumbnail_dir / video_key(entry.scan.info) / f"{entry.ref.clip:03d}-{entry.ref.panel}.jpg"

    def clip_path(self, entry: PanelEntry) -> Path:
        """パネル単体の動画。無ければ作る。"""
        path = self._clip_dir / _media_key(entry) / f"{entry.ref.clip:03d}-{entry.ref.panel}.mp4"
        with self._media_lock:
            if not path.exists():
                tmp = path.with_suffix(".tmp.mp4")
                export_panel_clip(entry.scan.info, entry.clip, entry.panel, tmp)
                # 作り途中のファイルを配信しないよう、書き終えてから置き換える
                tmp.replace(path)
        return path


def _media_key(entry: PanelEntry) -> str:
    # 動画の差し替えや解析ロジックの変更で区間が変わったら、別のフォルダに作り直す
    stamp = json.dumps({**file_stamp(entry.scan.info), "cache": CACHE_VERSION}, sort_keys=True)
    return f"{video_key(entry.scan.info)}-{hashlib.sha256(stamp.encode()).hexdigest()[:8]}"
